const FixedStepStrategy = require('./FixedStepStrategy');
const VelocityBasedStrategy = require('./VelocityBasedStrategy');

/**
 * Factory for creating tuning strategies
 *
 * Provides centralized creation of tuning strategy instances based on mode name.
 * Supports three modes:
 * - ModeA_Fine: Fixed 4.07 Hz/pulse (1 kHz per rotation)
 * - ModeA_Coarse: Fixed 20.33 Hz/pulse (5 kHz per rotation)
 * - ModeB_Velocity: Dynamic 4.07-40.65 Hz/pulse (velocity-based)
 */
class TuningStrategyFactory {
    /**
     * Create tuning strategy based on mode
     * @param {string} mode - "ModeA_Fine" | "ModeA_Coarse" | "ModeB_Velocity"
     * @param {object} config - Full config object containing TuningModes section
     * @returns {TuningStrategy} Instance of appropriate strategy
     * @throws {Error} If mode is unknown or config is missing
     */
    static create(mode, config) {
        if (!config.TuningModes) {
            throw new Error("Config missing TuningModes section");
        }

        const modeConfig = config.TuningModes[mode];

        if (!modeConfig) {
            throw new Error(`Unknown tuning mode: ${mode}. Available modes: ${Object.keys(config.TuningModes).join(', ')}`);
        }

        switch (mode) {
            case 'ModeA_Fine':
            case 'ModeA_Coarse':
                return new FixedStepStrategy(modeConfig);

            case 'ModeB_Velocity':
                return new VelocityBasedStrategy(modeConfig);

            default:
                throw new Error(`Unsupported tuning mode: ${mode}`);
        }
    }

    /**
     * Get list of available tuning modes
     * @param {object} config - Full config object
     * @returns {string[]} Array of mode names
     */
    static getAvailableModes(config) {
        if (!config.TuningModes) {
            return [];
        }
        return Object.keys(config.TuningModes);
    }

    /**
     * Validate mode name
     * @param {string} mode - Mode name to validate
     * @param {object} config - Full config object
     * @returns {boolean} True if mode is valid
     */
    static isValidMode(mode, config) {
        return config.TuningModes && config.TuningModes.hasOwnProperty(mode);
    }
}

module.exports = TuningStrategyFactory;