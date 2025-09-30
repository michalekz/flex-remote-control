const easymidi = require('easymidi');
const deviceElement = require("./deviceelement.js");
const readXlsxFile = require('read-excel-file/node');
const { getLogger } = require("../core/logger.js");
const path = require('path'); // ← PŘIDEJ

class controller {
    constructor(config, masteremit, publicdirname)
    {    
        this.logger = getLogger();
        this.Input = new easymidi.Input(config.WindowsMidiName);
        this.Output = new easymidi.Output(config.WindowsMidiName);
        this.MasterEmitter = masteremit;

        this.logger.info(`✓ MIDI: ${config.WindowsMidiName}`);

        this.OldCalledElement = new deviceElement();
        this.CurrentCalledElement = new deviceElement();

        this.Elements = [];    
        this.Elements1 = [];    
        this.CurrentLayerName = "Elements";
        this.Config = config;

        // ✅ OPRAVENO: Použij path.join() pro správné sestavení cesty
        const midiMapPath = path.join(publicdirname, 'midi', config.MidimapFile);
        this.logger.debug(`Loading MIDI mapping from: ${midiMapPath}`);

        readXlsxFile(midiMapPath, { sheet: "midimap"}).then((rows) => {
            for(let a=0; a < rows.length; a++)
            {
                let item = rows[a];
                this["Elements"].push(new deviceElement(item[0], item[1], item[2], item[3], item[4], item[5], item[6], item[7], item[8], item[9], item[10], item[11]));
            }
            this.logger.debug(`Loaded ${rows.length} elements (Layer 0)`);
        }).catch((err) => {
            this.logger.error(`Failed to load midimap sheet: ${err.message}`);
            this.logger.error(`Expected path: ${midiMapPath}`);
        });

        readXlsxFile(midiMapPath, { sheet: "midimap2"}).then((rows) => {
            for(let a=0; a < rows.length; a++)
            {
                let item = rows[a];
                this["Elements1"].push(new deviceElement(item[0], item[1], item[2], item[3], item[4], item[5], item[6], item[7], item[8], item[9], item[10], item[11]));
            }
            this.logger.debug(`Loaded ${rows.length} elements (Layer 1)`);

            setTimeout(() => this.switchLedGreen(), 2000);
        }).catch((err) => {
            this.logger.error(`Failed to load midimap2 sheet: ${err.message}`);
            this.logger.error(`Expected path: ${midiMapPath}`);
        });

        this.Input.on('message', (msg) => {
            this.logger.debug(`Raw MIDI: ${JSON.stringify(msg)}`);
            this.handle(msg);
        });
    }

    setCurrentLayer(layernr)
    {
        if(layernr==0)
            this.CurrentLayerName = "Elements";
        else
            this.CurrentLayerName = "Elements1";
    }

    closePorts()
    {
        this.logger.info("Closing MIDI ports");
        this.Input.close();
        this.Output.close();
    }
}

module.exports = controller;