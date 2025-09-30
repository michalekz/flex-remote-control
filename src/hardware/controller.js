const midi = require('@julusian/midi');
const deviceElement = require("./deviceelement.js");
const readXlsxFile = require('read-excel-file/node');
const { getLogger } = require("../core/logger.js");
const path = require('path');

class controller {
    constructor(config, masteremit, publicdirname)
    {
        this.logger = getLogger();

        // Initialize MIDI Input
        this.Input = new midi.Input();
        let inputPort = -1;
        for (let i = 0; i < this.Input.getPortCount(); i++) {
            if (this.Input.getPortName(i).includes(config.WindowsMidiName)) {
                inputPort = i;
                break;
            }
        }
        if (inputPort === -1) {
            throw new Error(`MIDI Input not found: ${config.WindowsMidiName}`);
        }
        this.Input.openPort(inputPort);

        // Initialize MIDI Output
        this.Output = new midi.Output();
        let outputPort = -1;
        for (let i = 0; i < this.Output.getPortCount(); i++) {
            if (this.Output.getPortName(i).includes(config.WindowsMidiName)) {
                outputPort = i;
                break;
            }
        }
        if (outputPort === -1) {
            throw new Error(`MIDI Output not found: ${config.WindowsMidiName}`);
        }
        this.Output.openPort(outputPort);

        // Add easymidi-compatible send() method
        this.Output.send = (type, data) => {
            let status, data1, data2;

            switch(type) {
                case 'noteon':
                    status = 0x90 | (data.channel || 0);
                    data1 = data.note;
                    data2 = data.velocity;
                    break;
                case 'noteoff':
                    status = 0x80 | (data.channel || 0);
                    data1 = data.note;
                    data2 = data.velocity || 0;
                    break;
                case 'cc':
                    status = 0xB0 | (data.channel || 0);
                    data1 = data.controller;
                    data2 = data.value;
                    break;
                default:
                    this.logger.error(`Unknown MIDI message type: ${type}`);
                    return;
            }

            this.Output.sendMessage([status, data1, data2]);
        };

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

        // @julusian/midi sends messages as (deltaTime, message) where message is an array
        this.Input.on('message', (deltaTime, message) => {
            this.logger.debug(`Raw MIDI: ${message} (dt: ${deltaTime})`);

            // Convert @julusian/midi format to easymidi-compatible format
            const status = message[0];
            const messageType = status >> 4;
            const channel = status & 0x0F;

            const typeMap = {
                0x8: 'noteoff',
                0x9: 'noteon',
                0xB: 'cc',
                0xE: 'pitch'
            };

            const formattedMsg = {
                _type: typeMap[messageType] || 'unknown',
                channel: channel,
                note: message[1],
                velocity: message[2],
                controller: message[1],
                value: message[2]
            };

            this.handle(formattedMsg);
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
        this.Input.closePort();
        this.Output.closePort();
    }
}

module.exports = controller;