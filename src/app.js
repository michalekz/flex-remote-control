var Controller = null;

const path = require('path');

// Konfigurace je nyní v config/ složce (o úroveň výš než src/)
var configdir = path.join(__dirname, "../config");
const Global = require(path.join(configdir, "global.json"));

if(Global.publicdirnum !== undefined && Global.publicdirnum > 0)
    configdir = path.join(__dirname, "../config" + Global.publicdirnum);

// Konfigurace jsou nyní v config/stations/
const configPath = path.join(configdir, "stations", `config${Global.default}.json`);
var Config = require(configPath);

if(Config.Debug === undefined)
    Config.Debug = false;

var defaults = require(path.join(configdir, "defaults.json"));

if(defaults.RitFreq === undefined)
    defaults.RitFreq = [5000,1000];

// Initialize centralized logger
const { getLogger } = require("./core/logger.js");
const logger = getLogger();
logger.setDebugMode(Config.Debug);

const FlexDominator = require("./core/flexdominator.js");
const xxFlexRadio = require("./hardware/xxflexradio.js");

const EventEmitter = require('node:events');

if(Config.WindowsMidiName == "DJControl Starlight")
    Controller = require("./hardware/djcontrollerstarlight.js");
else {
    Controller = require("./hardware/djcontrollerstarlight.js"); // starlight will be default
}

const masterEmitter = new EventEmitter();

var xxFlex = new xxFlexRadio(Config, defaults, masterEmitter);
var controller = new Controller(Config, masterEmitter, configdir);

// FlexDominator needs reference to controller for toggleTuningMode
const flexDominator = new FlexDominator(masterEmitter, defaults, controller);

Global.InConfigMode = false;
Global.Layer = 0;

logger.info("FlexDominator v1.1.0RC1 starting...");

masterEmitter.on("ce", function (elm)
{
    try
    {
        if(!Global.InConfigMode)
        {
            // Some commands don't require FlexRadio (local controller operations)
            const localCommands = ['toggleTuningMode'];
            const requiresFlexRadio = !localCommands.includes(elm.MappedTo);

            // Wait for FlexRadio initialization before processing events (except local commands)
            if(requiresFlexRadio && (!xxFlex.IsInit || xxFlex.SliceNumbs.length === 0)) {
                logger.debug(`FlexRadio not initialized yet, ignoring event for ${elm.Id}`);
                return;
            }

            if(flexDominator[elm.MappedTo] === undefined)
            {
                logger.error(`Key ${elm.Id} not mapped to function "${elm.MappedTo}"`);
            }
            else
            {
                logger.debug(`Calling flexDominator.${elm.MappedTo}() for element ${elm.Id}`);
                let command = flexDominator[elm.MappedTo](elm, xxFlex);
                
                if(command !== null && command !== undefined && command !== "")
                {
                    logger.flex(`Executing: ${command}`);
                    xxFlex.fire(command);
                }
                else
                {
                    logger.debug(`${elm.MappedTo}() returned empty command`);
                }
            }
        }
        else
        {
            logger.debug(`Config mode: handling button ${elm.Id}`);
            switch(elm.Id)
            {
                case "7|0":
                    switchToConfig(1, elm);
                    break;
                case "7|1":
                    switchToConfig(2, elm);
                    break;                
                case "7|2":
                    switchToConfig(3, elm);
                    break;
                
                case "7|3":
                    switchToConfig(4, elm);
                    break;

                case "7|16":
                    switchToConfig(5, elm);
                    break;

                case "7|17":
                    switchToConfig(6, elm);
                    break;
                    
                case "7|18":
                    switchToConfig(7, elm);
                    break;
                    
                case "7|19":
                    switchToConfig(8, elm);
                    break;
            }
        }
    }
    catch(error)
    {
        logger.error(`Method execution failed: ${error.message}`);
        return;
    }

    // Handle LED feedback
    if(elm.BtnTyp == 2)
    {
        setTimeout(() => controller.switchLedOff(elm.Id), 500);
    }
    else if(elm.BtnTyp == 4)
    {
        setTimeout(() => controller.setElementandLedOff(elm.Id), 500);
    }
});

masterEmitter.on("ct", function (freq)
{
    logger.flex(`Center panadapter: ${freq} MHz`);
    xxFlex.fire("display pan s "+ xxFlex.DisplayPan.StreamId + " center="+freq);
});

masterEmitter.on("cptt", function (sl, sli, sta)
{
    logger.debug(`PTT: Slice${sl}, State=${sta}`);
    if(xxFlex["Slice"+sl].tx==0)
        xxFlex.fire("slice s "+sli+" tx=1");
    xxFlex.fire("xmit "+sta);
});

masterEmitter.on("def", function (freq, mod)
{
    logger.info(`Reset slices to ${freq} MHz, ${mod} mode`);
    xxFlex.fire("slice r "+xxFlex.SliceNumbs[0]);
    xxFlex.fire("slice r "+xxFlex.SliceNumbs[1]);
    xxFlex.SliceNumbs = [];

    xxFlex.fire("slice create freq="+(freq) +" ant=ANT1 mode="+mod);    
    xxFlex.fire("slice create freq="+(freq+0.005) +" ant=ANT1 mode="+mod);
    
    xxFlex.fire("slice t 0 "+(freq+0.001));    
    xxFlex.fire("slice t 1 "+(freq+0.006));
});

masterEmitter.on("con", function ()
{
    if(Global.InConfigMode)
    {
        Global.InConfigMode = false;
        logger.info("Config mode OFF");
    }
    else
    {
        Global.InConfigMode = true;
        logger.info("Config mode ON");
        controller.switchLedPurple();
    }
});

masterEmitter.on("connected", function ()
{
    logger.info("✓ Connected to FlexRadio");
    controller.switchLedGreen();
});

masterEmitter.on("error", function ()
{
    logger.error("✗ FlexRadio connection lost");
    controller.switchLedRed();
});

masterEmitter.on("responseList", function (item)
{
    logger.debug(`Response: ${JSON.stringify(item)}`);
});

masterEmitter.on("tgl", function (elm)
{
    if(Global.Layer==0)
    {
        Global.Layer = 1;
        logger.debug("Switch to Layer 1");
        if(elm.State==0)
        {
            elm.State = 1;
            controller.switchLed(elm);            
        }
    }
    else
    {
        Global.Layer = 0;
        logger.debug("Switch to Layer 0");
        if(elm.State==1)
        {
            elm.State = 0;
            controller.switchLed(elm);            
        }
    }
    controller.setCurrentLayer(Global.Layer);
});

var wasSingle = false;

masterEmitter.on("fadeSO2R", function (flx, mode, a, b)
{
    if(mode < 2)
    {
        wasSingle = true;
        xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" pan 50");
        xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" pan 50");
    
        if(mode==0)
        {
            logger.debug("SO2R: Slice A only");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" mute 0");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" mute 1");
            return;
        }
        else if(mode==1)
        {
            logger.debug("SO2R: Slice B only");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" mute 1");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" mute 0");
            return;
        }    
    }
    else
    {
        if(wasSingle==true)
        {
            logger.debug("SO2R: Both slices (stereo)");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" mute 0");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" mute 0");

            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" pan 0");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" pan 100");
            wasSingle = false;
        }
        return;
    }
});

masterEmitter.on("fadeSO2RMix", function (flx, mode, a, b)
{
    if(mode < 2)
    {
        wasSingle = true;
        xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" pan 50");
        xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" pan 50");
    
        if(mode==0)
        {
            logger.debug("SO2R Mix: Slice A only");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" mute 0");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" mute 1");
            return;
        }
        else if(mode==1)
        {
            logger.debug("SO2R Mix: Slice B only");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" mute 1");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" mute 0");
            return;
        }    
    }
    else
    {
        if(wasSingle==true)
        {
            logger.debug("SO2R Mix: Both slices (30/70 pan)");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" mute 0");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" mute 0");

            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ a +" pan 30");
            xxFlex.fire("audio client "+ flx.client_handle + " slice "+ b +" pan 70");

            wasSingle = false;
        }
        return;
    }
});

function switchToConfig(nr, elm)
{
    if(nr > Global.configs)
        return;

    logger.info(`Switching to config${nr}.json`);

    xxFlex.disconnect();
    controller.closePorts();

    // Načti novou konfiguraci ze stations/
    const newConfigPath = path.join(configdir, "stations", `config${nr}.json`);
    Config = require(newConfigPath);

    logger.info(`Target: ${Config.FlexIP}`);
    
    setTimeout((elm, em) => {
        xxFlex = new xxFlexRadio(Config, defaults, em);
        controller = new Controller(Config, em, configdir);
        Global.InConfigMode = false;
        setTimeout(() => {
            controller.switchLedOff(elm.Id);
        }, 3000);
    }, 1000, elm, masterEmitter);
}