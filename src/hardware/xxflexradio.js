const { Radio } = require('flexradio-js/Radio');
const cp = require('child_process');
const { getLogger } = require("../core/logger.js");

class xxFlexRadio extends Radio{
    constructor(con, defconf, emitt) 
    {
        // Direct connection if UseDiscovery is disabled and IP is provided
        if (con.UseDiscovery === false && con.FlexIP) {
            super({
                ip: con.FlexIP, 
                port: con.FlexPort || 4992
            });
        } else {
            super({
                station: con.StationName,
                port: con.FlexPort || 4992
            });
        }

        this.logger = getLogger();
        
        if (con.UseDiscovery === false && con.FlexIP) {
            this.logger.info(`Connecting to ${con.FlexIP}:${con.FlexPort || 4992}...`);
        } else {
            this.logger.info(`Discovery mode: searching for "${con.StationName}"...`);
        }

        this.IP = con.FlexIP;
        this.ConfigX = con;
        this.Port = con.FlexPort || 4992;

        this.Slice0 = {};
        this.Slice1 = {};
        this.DisplayPan = {};

        this.CWFilter = defconf.CWFilter;
        this.Filter = defconf.Filter;
        this.PanBW = defconf.PanBW;        
        this.MasterEmitter = emitt;
 
        this.on('connected', function() {
            this.logger.info('✓ Radio connected');
            this.MasterEmitter.emit("connected");
            
            setTimeout(() => { 
                this.fire("sub client all");
                if(this.SmartSDRClientID !== undefined && this.SmartSDRClientID != "")
                {
                    this.fire("client bind client_id="+this.SmartSDRClientID);
                    this.logger.debug(`Binding to SmartSDR client: ${this.SmartSDRClientID}`);
                }
                else
                {
                    this.logger.warn("SmartSDRClientID not set - PTT control may not work properly");
                }
                this.fire("sub radio all");
            },2000);
        });

        if(this.ConfigX.StationName === undefined || this.ConfigX.StationName == "")
            this.Station = process.env.COMPUTERNAME.replace(String.fromCharCode(32), String.fromCharCode(127)); 
        else
            this.Station = this.ConfigX.StationName.replace(String.fromCharCode(32), String.fromCharCode(127)); 
        
        if(this.ConfigX.SmartSDRClientID !== undefined || this.ConfigX.SmartSDRClientID != "")
            this.SmartSDRClientID = this.ConfigX.SmartSDRClientID; 
        
        this.ClientHandle = "";
        this.SliceNumbs = [];
        this.IsInit = false;
        this.initTemp = [];

        this.on('status', function(status) {
            // Clear the init timeout when receiving status messages
            if(this.InitTimeout) {
                clearTimeout(this.InitTimeout);
                this.InitTimeout = null;
            }
            
            if(!this.IsInit)
            {
                this.InitTimeout = this.startInitTimeout();
                
                if(status.payload !== undefined)
                {
                    this.initTemp.push(status);
                }
                return;
            }
    
            try
            {
                if(status.topic.startsWith("slice/"))
                {
                    let reqSlice = status.topic.split("/");

                    if((status.client !== undefined && status.client == this.ClientHandle) || 
                       (status.payload.client_handle !== undefined && status.payload.client_handle == this.ClientHandle))
                    {
                        let svalue = parseInt(reqSlice[1]);
                        if(!this.SliceNumbs.includes(svalue) && this.SliceNumbs.length<2)
                        {
                            this.SliceNumbs.push(svalue);
                        }                                        

                        if(this.IsInit && status.topic == "slice/"+this.SliceNumbs[0])
                        {
                            this.execSlice0(status.payload);                            
                            if(status.payload.in_use !== undefined)
                                this.handleActiveStateOfSlice(0);
                        }
                        else if(this.IsInit && status.topic == "slice/"+this.SliceNumbs[1])
                        {
                            this.execSlice1(status.payload);
                            if(status.payload.in_use !== undefined)
                                this.handleActiveStateOfSlice(1);
                        }
                    }
                }
                else
                {
                    if(this.SmartSDRClientID !== undefined && this.SmartSDRClientID == "" && 
                       status.payload.station !== undefined && status.payload.station == this.Station)
                    {
                        this.SmartSDRClientID = status.payload.client_id;
                        this.logger.info(`Found SmartSDR client ID: ${status.payload.client_id}`);
                        this.logger.warn(`Add "SmartSDRClientID": "${status.payload.client_id}" to config.json for proper PTT control`);
                        this.fire("unsub radio all");
                    }
                }
            }
            catch(err)
            {
                if(status.topic.startsWith("slice/") && status.payload.RF_frequency !== undefined)
                {
                    let reqSlice = status.topic.split("/");
                    let svalue = parseInt(reqSlice[1]);
                    
                    if(this.SliceNumbs.includes(svalue))
                    {
                        if(this.IsInit && status.topic == "slice/"+this.SliceNumbs[0])
                        {
                            this.execSlice0(status.payload);                            
                            if(status.payload.in_use !== undefined)
                                this.handleActiveStateOfSlice(0);
                        }
                        else if(this.IsInit && status.topic == "slice/"+this.SliceNumbs[1])
                        {
                            this.execSlice1(status.payload);
                            if(status.payload.in_use !== undefined)
                                this.handleActiveStateOfSlice(1);
                        }
                    }
                }
            }
        });
                
        this.on('error', function(error) {
            this.logger.error(`Connection error: ${error.error} - Reconnecting...`);
            setTimeout(() => this.connect(), 3000);
            this.MasterEmitter.emit("error");
        });

        this.on('close', function() {
            this.logger.warn("Connection closed - Reconnecting...");
            setTimeout(() => this.connect(), 3000);
            this.MasterEmitter.emit("error");
        });

        this.connect();
        this.fire("sub slice all");
        this.fire("sub pan all");
        this.fire("sub radio all");
    }

    handleActiveStateOfSlice(ab)
    {
        if(ab==0)
        {
            if(this.Slice0.in_use==0)
            {
                this.SliceNumbs.splice(0, 1);
                Object.assign(this.Slice0, this.Slice1);
            }
            return;
        }

        if(ab==1)
        {
            if(this.Slice1.in_use==0)
            {
                this.SliceNumbs.splice(1, 1);
                Object.assign(this.Slice1, this.Slice0);
            }
            return;
        }
    }

    startInitTimeout() {
        return setTimeout(() => {
            this.logger.debug('Processing initialization data...');
            this.execInitMsg();
        }, 3000);
    }

    execSlice0(payload)
    {
        this.fire("slice list");
        this.Slice0 = { ...this.Slice0, ...payload};

        if(this.Slice0.mode != "CW")
        {
            if(this.Filter.indexOf(this.Slice0.filter_hi-this.Slice0.filter_lo) > -1)
            {
                this.Slice0.InitFilterBW = this.Slice0.filter_hi-this.Slice0.filter_lo;
            }
        }
        else
        {
            if(this.CWFilter.indexOf(this.Slice0.filter_hi-this.Slice0.filter_lo) > -1)
            {
                this.Slice0.InitFilterBW = this.Slice0.filter_hi-this.Slice0.filter_lo;
            }
        }
    }

    execSlice1(payload)
    {
        this.Slice1 = { ...this.Slice1, ...payload};

        if(this.Slice1.mode != "CW")
        {
            if(this.Filter.indexOf(this.Slice1.filter_hi-this.Slice1.filter_lo) > -1)
            {
                this.Slice1.InitFilterBW = this.Slice1.filter_hi-this.Slice1.filter_lo;
            }
        }
        else
        {
            if(this.CWFilter.indexOf(this.Slice1.filter_hi-this.Slice1.filter_lo) > -1)
            {
                this.Slice1.InitFilterBW = this.Slice1.filter_hi-this.Slice1.filter_lo;
            }
        }
    }

    fire(cmd)
    {
        if(cmd == null || cmd.includes("undefined") || cmd.includes("NaN")) 
           return;

        this.logger.flex(cmd);
        
        this.send(cmd, function(res) {
            // Response callback
        });
    }

    getSliceList()
    {
        this.send("slice list", (res) => {
            this.MasterEmitter.emit("responseList", res);
        });        
    }

    execInitMsg()
    {
        if(this.IsInit) {
            return;
        }
        
        this.IsInit = true;
        
        if(this.ClientHandle == "")
        {
            let determineClientHandle = this.initTemp.filter((elm) => 
                elm.topic.startsWith("client/") && elm.payload.station == this.Station);

            if(determineClientHandle.length === 0 && this.SmartSDRClientID) {
                this.logger.debug(`Fallback: matching SmartSDR client_id="${this.SmartSDRClientID}"`);
                determineClientHandle = this.initTemp.filter((elm) => 
                    elm.topic.startsWith("client/") && elm.payload.client_id == this.SmartSDRClientID);
            }
            
            if(determineClientHandle.length>0)
            {
                let cvalarr = determineClientHandle[0].topic.split("/");
                this.ClientHandle = cvalarr[1];
                this.logger.debug(`ClientHandle: ${this.ClientHandle}`);
            }
        }

        if(this.HerculesHandle == undefined || this.HerculesHandle == "")
        {
            this.HerculesHandle = this.initTemp[0].client;
        }
        
        let dot = this.initTemp.filter((elm) => 
            elm.payload.client_handle == this.ClientHandle && elm.topic.startsWith("slice"));
        
        this.logger.debug(`Found ${dot.length} slice(s) for this client`);
        
        if(dot.length > 1) {
            dot.sort((a, b) => {
                let letterA = a.payload.index_letter || "Z";
                let letterB = b.payload.index_letter || "Z";
                return letterA.localeCompare(letterB);
            });
        }

        let cnt = 0;

        dot.forEach(element => {
            if(element.type=="status" && element.topic.startsWith("slice/"))
            {
                let svalue = parseInt(element.topic.split("/")[1]);

                if(!this.SliceNumbs.includes(svalue) && this.SliceNumbs.length<2)
                {
                    this.SliceNumbs.push(svalue);
                    this["execSlice"+cnt](element.payload);
                    cnt++;
                }                                        
            }
        });
        
        this.initTemp = [];
        
        // Only show summary in non-debug mode
        let sliceAInfo = this.Slice0.RF_frequency ? `${this.Slice0.RF_frequency} MHz ${this.Slice0.mode}` : "N/A";
        let sliceBInfo = this.Slice1.RF_frequency ? `${this.Slice1.RF_frequency} MHz ${this.Slice1.mode}` : "N/A";
        
        this.logger.info(`✓ Ready | Slice A: ${sliceAInfo} | Slice B: ${sliceBInfo}`);
    }
}

module.exports = xxFlexRadio;