const controller = require("./controller");
const { getLogger } = require("../core/logger.js");
const TuningStrategyFactory = require("../core/tuning/TuningStrategyFactory");
const JogAccumulator = require("../core/tuning/JogAccumulator");

class djcontrollerstarlight extends controller {
    constructor(config, masteremit, publicdirname) {
        super(config, masteremit, publicdirname);
        this.logger = getLogger();

        // LEGACY: Keep old throttle for backward compatibility (if needed)
        this.jogThrottle = {};
        this.jogThrottleDelay = config.JogCoolDown || 50; // ms between VFO events

        // === NEW: Velocity-based tuning system ===

        // Load tuning modes from config (separate for each deck)
        const defaultMode = config.TuningMode || 'ModeB_Velocity';
        this.tuningModes = {
            A: config.TuningModeA || defaultMode,  // Left deck mode
            B: config.TuningModeB || defaultMode   // Right deck mode
        };

        // Create separate jog accumulators for each deck (Part A and B)
        // Part A = left deck (Slice 0), Part B = right deck (Slice 1)
        const velocityConfig = config.TuningModes?.ModeB_Velocity || {
            smoothingWindow: 10,
            stopThreshold: 150
        };
        this.jogAccumulators = {
            A: new JogAccumulator(velocityConfig),  // Left deck (Slice 0)
            B: new JogAccumulator(velocityConfig)   // Right deck (Slice 1)
        };

        // Create separate tuning strategies for each deck
        this.tuningStrategies = {};
        try {
            this.tuningStrategies.A = TuningStrategyFactory.create(this.tuningModes.A, config);
            this.tuningStrategies.B = TuningStrategyFactory.create(this.tuningModes.B, config);
            this.logger.info(`Tuning modes - Deck A: ${this.tuningStrategies.A.getDescription()}, Deck B: ${this.tuningStrategies.B.getDescription()}`);
        } catch (err) {
            this.logger.error(`Failed to create tuning strategy: ${err.message}`);
            // Fallback to ModeB_Velocity for both
            this.tuningModes.A = 'ModeB_Velocity';
            this.tuningModes.B = 'ModeB_Velocity';
            this.tuningStrategies.A = TuningStrategyFactory.create(this.tuningModes.A, config);
            this.tuningStrategies.B = TuningStrategyFactory.create(this.tuningModes.B, config);
        }

        // Store config reference for mode switching
        this.tuningConfig = config;
        this.encoderPulsesPerRotation = config.EncoderPulsesPerRotation || 246;
    }

    handle(msg)
    {
        // Only log MIDI events in debug mode
        this.logger.midi(`${msg._type} Ch:${msg.channel} CC:${msg.note || msg.controller} Val:${msg.velocity || msg.value}`);
        
        if(this.isOnIgnoreList(msg))
            return;

        let res = -1;
        let id = msg.channel + "|" + (msg._type == "noteon" ? msg.note : msg.controller);

        // NEW: Handle jog wheel with velocity-based tuning
        // Check for jog wheels: Channel 1 or 2 with CC 9 or 10
        if(msg._type === "cc" && (msg.channel === 1 || msg.channel === 2) && (msg.controller === 9 || msg.controller === 10)) {
            // Find element from Excel mapping to get Part (A/B for left/right deck)
            res = this[this.CurrentLayerName].findIndex((elm) =>
                (id.localeCompare(elm.Id) == 0 && elm.MsgType.localeCompare(msg._type) == 0));

            const mappedElement = (res > -1) ? this[this.CurrentLayerName][res] : null;
            this.handleJogWheelEvent(msg, mappedElement);
            return; // Don't continue to normal mapping
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

    /**
     * Handle jog wheel events with velocity-based tuning
     * @param {object} msg - MIDI message
     * @param {object} mappedElement - Element from Excel mapping (contains Part property)
     */
    handleJogWheelEvent(msg, mappedElement) {
        const direction = (msg.value === 1) ? 1 : -1; // 1=CW, 127=CCW → -1
        const timestamp = Date.now();

        // Get Part from Excel mapping (A=left deck, B=right deck)
        const part = mappedElement?.Part || "A"; // Default to A if not found

        // Get accumulator and strategy for THIS deck (Part A or B)
        const accumulator = this.jogAccumulators[part];
        const strategy = this.tuningStrategies[part];
        const currentMode = this.tuningModes[part];

        // FIRST: Add event to accumulator to update velocity history
        // This must happen for EVERY event, not just sent events
        const velocity = accumulator.getVelocity();
        const hzPerPulse = strategy.calculateHzPerPulse(velocity);
        accumulator.addEvent(direction, hzPerPulse, timestamp);

        // Check throttle AFTER adding to accumulator
        const throttle = strategy.getThrottle(velocity);
        const id = part; // Separate throttle per deck (A/B)

        const now = Date.now();
        if(this.jogThrottle[id] && (now - this.jogThrottle[id] < throttle)) {
            return; // Accumulating, will send later
        }

        // Send accumulated delta from THIS deck's accumulator
        const currentFreq = accumulator.getCurrentFrequency();
        const lastSentFreq = accumulator.lastSentFrequency;
        const deltaHz = currentFreq - lastSentFreq;

        // Only send if there's actual change
        if (Math.abs(deltaHz) < 0.1) {
            return; // Nothing to send
        }

        this.logger.debug(`Jog Part${part}: vel=${velocity.toFixed(1)} ev/s, step=${hzPerPulse.toFixed(2)} Hz/pulse, delta=${(deltaHz/1000).toFixed(2)} kHz, mode=${currentMode}`);

        // Create fake element to emit frequency change
        const fakeElement = {
            Id: `${msg.channel}|${msg.controller}`,
            Part: part, // A or B from Excel mapping
            Type: "Jog",
            Command: "jogFrequencyChange",
            MappedTo: "jogFrequencyChange",
            State: deltaHz, // Send DELTA, not absolute frequency
            velocity: velocity,
            mode: currentMode // Use deck-specific mode
        };

        this.MasterEmitter.emit("ce", fakeElement);

        this.jogThrottle[id] = now;
        accumulator.getFrequencyAndMark(); // Mark as sent for THIS deck
    }

    /**
     * Toggle tuning mode for specific deck (cycles through ModeA_Fine → ModeA_Coarse → ModeB_Velocity)
     * Called from button mapping in Hercules.xlsx
     * @param {object} elm - Element with Part property (A or B)
     * @returns {string} Description of new mode
     */
    toggleTuningMode(elm) {
        // Determine which deck to toggle based on Part property
        const part = elm?.Part || "A"; // Default to A if not specified

        const modes = ['ModeA_Fine', 'ModeA_Coarse', 'ModeB_Velocity'];
        const currentIndex = modes.indexOf(this.tuningModes[part]);
        const nextIndex = (currentIndex + 1) % modes.length;
        const oldMode = this.tuningModes[part];

        this.tuningModes[part] = modes[nextIndex];

        // Create new strategy for this deck
        this.tuningStrategies[part] = TuningStrategyFactory.create(this.tuningModes[part], this.tuningConfig);

        // Save to config (persistence)
        this.saveTuningMode();

        // Log change
        this.logger.info(`Tuning mode Deck ${part}: ${oldMode} → ${this.tuningModes[part]} (${this.tuningStrategies[part].getDescription()})`);

        return `Deck ${part} tuning mode: ${this.tuningModes[part]}`;
    }

    /**
     * Save current tuning modes to config file
     */
    saveTuningMode() {
        const fs = require('fs');
        const path = require('path');

        // Update config object with both deck modes
        this.tuningConfig.TuningModeA = this.tuningModes.A;
        this.tuningConfig.TuningModeB = this.tuningModes.B;
        // Keep legacy TuningMode for backward compatibility (use deck A)
        this.tuningConfig.TuningMode = this.tuningModes.A;

        // Save to file
        const configPath = path.join(__dirname, '../../config/stations/config1.json');

        try {
            fs.writeFileSync(configPath, JSON.stringify(this.tuningConfig, null, 4), 'utf8');
            this.logger.debug(`Saved tuning modes to config: A=${this.tuningModes.A}, B=${this.tuningModes.B}`);
        } catch (err) {
            this.logger.error(`Failed to save tuning modes: ${err.message}`);
        }
    }
}

module.exports = djcontrollerstarlight;