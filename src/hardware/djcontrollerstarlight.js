const controller = require("./controller");
const { getLogger } = require("../core/logger.js");

class djcontrollerstarlight extends controller {
    constructor(config, masteremit, publicdirname) {
        super(config, masteremit, publicdirname);
        this.logger = getLogger();
        
        // Add throttling for jog wheels (VFO) to reduce event spam
        this.jogThrottle = {};
        this.jogThrottleDelay = config.JogCoolDown || 50; // ms between VFO events
    }

    handle(msg)
    {
        // Only log MIDI events in debug mode
        this.logger.midi(`${msg._type} Ch:${msg.channel} CC:${msg.note || msg.controller} Val:${msg.velocity || msg.value}`);
        
        if(this.isOnIgnoreList(msg))
            return;
        
        let res = -1;
        let id = msg.channel + "|" + (msg._type == "noteon" ? msg.note : msg.controller);
        
        // Throttle jog wheel events (controllers 9 and 10) to reduce FlexRadio command spam
        if(msg._type === "cc" && (msg.controller === 9 || msg.controller === 10)) {
            const now = Date.now();
            if(this.jogThrottle[id] && (now - this.jogThrottle[id] < this.jogThrottleDelay)) {
                // Skip this event - too soon after last one
                return;
            }
            this.jogThrottle[id] = now;
        }
        
        this.logger.mapping(`Search: ${id} (${msg._type}) in ${this.CurrentLayerName}`);

        res = this[this.CurrentLayerName].findIndex((elm) => 
            (id.localeCompare(elm.Id) == 0 && elm.MsgType.localeCompare(msg._type) == 0));
        
        this.logger.mapping(`Result: ${res >= 0 ? 'Found at index '+res : 'Not found'}`);
        
        Object.assign(this.OldCalledElement, this.CurrentCalledElement);

        if(res > -1 && msg._type == this[this.CurrentLayerName][res].MsgType)
        {
            if(this[this.CurrentLayerName][res].Type=="Btn")
            {
                if(msg.velocity == 127 && this[this.CurrentLayerName][res].GrpId > 0)
                {
                    let grpMembers = this[this.CurrentLayerName].filter(eli => eli.GrpId == this[this.CurrentLayerName][res].GrpId);

                    grpMembers.forEach(element => {
                        if(element.Id != this[this.CurrentLayerName][res].Id)
                        {
                            if(element.State == 1)
                            {
                                let gin = this[this.CurrentLayerName].findIndex((elm) => elm.Id == element.Id);        

                                if(gin > -1)
                                {
                                    if(this[this.CurrentLayerName][gin].State == 1)
                                    {
                                        this[this.CurrentLayerName][gin].State = 0;
                                        this.handleHardware(this[this.CurrentLayerName][gin]);
                                    }
                                }
                            }
                        }
                    });
                }
                if(this[this.CurrentLayerName][res].BtnTyp != 3)
                {
                    if(msg.velocity == 127)
                    {
                        this[this.CurrentLayerName][res].toggleState();
                        this.handleHardware(this[this.CurrentLayerName][res]);
                    }    
                }
                else {
                    if(msg.velocity == 127)
                    {                        
                        this[this.CurrentLayerName][res].OnState();
                    }
                    else
                    {
                        this[this.CurrentLayerName][res].OffState();
                    }
                    this.handleHardware(this[this.CurrentLayerName][res]);
                }
            }
            else
            {
                this[this.CurrentLayerName][res].State = msg.value;

                if(this[this.CurrentLayerName][res].Type== "Jog" || this.OldCalledElement.State !== this[this.CurrentLayerName][res].State)
                    this.handleHardware(this[this.CurrentLayerName][res]);
            }
            Object.assign(this.CurrentCalledElement, this[this.CurrentLayerName][res]);
        }
        else
        {
            this.logger.debug(`No mapping for ${id} (${msg._type})`);
        }
    }

    setElementandLedOff(id)
    {
        let res = this[this.CurrentLayerName].findIndex((elm) => elm.Id == id);
        this[this.CurrentLayerName][res].State = 0;
        this.handleHardware(this[this.CurrentLayerName][res]);
    }

    switchLedOff(id)
    {
        for(let i=0; i < this[this.CurrentLayerName].length; i++)
        {
            if(this[this.CurrentLayerName][i].Id == id)
            {
                this[this.CurrentLayerName][i].State = 0;
                this.switchLed(this[this.CurrentLayerName][i]);
                return
            }
        }

        this.logger.warn(`LED not found: ${id}`);
    }

    switchLed(element)
    {
        let resultLed = {};

        resultLed.channel = element.Channel;
        resultLed.note = element.Controller;

        if(element.State == 1)
            resultLed.velocity = element.OnValue
        else
            resultLed.velocity = element.OffValue

        this.Output.send("noteon", resultLed);
    }

    switchLedRed()
    {
        this.handelBaseColor("1|35", 64);
        this.handelBaseColor("2|35", 64);
    }

    switchLedPurple()
    {
        this.handelBaseColor("1|35", 67);
        this.handelBaseColor("2|35", 67);
    }

    switchLedGreen()
    {
        this.handelBaseColor("1|35", 93);
        this.handelBaseColor("2|35", 93);
    }

    handleHardware(element)
    {
        if(element.Type=="Btn")
        {                        
            this.switchLed(element);
        }

        this.MasterEmitter.emit("ce", element);
    }

    handelBaseColor(id, col)
    {
        let res = this[this.CurrentLayerName].findIndex((elm) => elm.Id == id);        
        
        try
        {
            this[this.CurrentLayerName][res].State = col;
            this.Output.send("noteon", {channel: this[this.CurrentLayerName][res].Channel, note: this[this.CurrentLayerName][res].Controller, velocity: this[this.CurrentLayerName][res].State});    
        }
        catch(err)
        {
            return;
        }
    }

    isOnIgnoreList(msg)
    {
        if(msg._type=="cc")
        {
            let d = msg.channel+"|"+msg.controller;
            
            switch(d)
            {
                case "1|40":
                case "0|35":
                case "1|32":
                case "1|33":
                case "2|40":
                case "0|36":
                case "2|32":
                case "2|33":
                {
                    return true;
                }
            }
        }

        return false;
    }
}

module.exports = djcontrollerstarlight;