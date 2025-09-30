const fs = require('fs');
const path = require('path');

class ConfigLoader {
    static loadJSON(relativePath) {
        const fullPath = path.join(__dirname, '../../config', relativePath);
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }

    static loadGlobal() {
        return this.loadJSON('global.json');
    }

    static loadDefaults() {
        return this.loadJSON('defaults.json');
    }

    static loadStation(stationNumber) {
        return this.loadJSON(`stations/config${stationNumber}.json`);
    }
}

module.exports = ConfigLoader;