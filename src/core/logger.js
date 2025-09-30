/**
 * Centralized Logger for FlexDominator
 * When Debug=false: Only ERROR, WARN and INFO messages
 * When Debug=true: All messages including DEBUG, MIDI, MAPPING, FLEX
 */

class Logger {
    constructor(debugMode = false) {
        this.debugMode = debugMode;
    }

    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    // Always visible - critical information (startup, connections)
    info(message, ...args) {
        console.log(`[INFO] ${message}`, ...args);
    }

    // Always visible - warnings
    warn(message, ...args) {
        console.log(`[WARN] ${message}`, ...args);
    }

    // Always visible - errors
    error(message, ...args) {
        console.log(`[ERROR] ${message}`, ...args);
    }

    // Only visible when Debug=true
    debug(message, ...args) {
        if (this.debugMode) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }

    // Only visible when Debug=true - for MIDI events
    midi(message, ...args) {
        if (this.debugMode) {
            console.log(`[MIDI] ${message}`, ...args);
        }
    }

    // Only visible when Debug=true - for mapping operations
    mapping(message, ...args) {
        if (this.debugMode) {
            console.log(`[MAPPING] ${message}`, ...args);
        }
    }

    // Only visible when Debug=true - for FlexRadio protocol
    flex(message, ...args) {
        if (this.debugMode) {
            console.log(`[FLEX] ${message}`, ...args);
        }
    }
}

// Create singleton instance
let loggerInstance = null;

function getLogger() {
    if (!loggerInstance) {
        loggerInstance = new Logger(false);
    }
    return loggerInstance;
}

module.exports = { Logger, getLogger };