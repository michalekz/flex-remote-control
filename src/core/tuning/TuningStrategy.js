/**
 * Abstract base class for tuning strategies
 *
 * Defines interface for calculating frequency steps based on velocity
 * and determining throttle intervals for MIDI event handling.
 */
class TuningStrategy {
    constructor(config) {
        if (this.constructor === TuningStrategy) {
            throw new Error("TuningStrategy is abstract and cannot be instantiated directly");
        }
        this.config = config;
    }

    /**
     * Calculate Hz per pulse based on current velocity
     * @param {number} velocity - Events per second
     * @returns {number} Hz per pulse
     */
    calculateHzPerPulse(velocity) {
        throw new Error("calculateHzPerPulse() must be implemented by subclass");
    }

    /**
     * Get throttle interval in ms based on velocity
     * @param {number} velocity - Events per second
     * @returns {number} Throttle in milliseconds
     */
    getThrottle(velocity) {
        throw new Error("getThrottle() must be implemented by subclass");
    }

    /**
     * Get description of this tuning mode
     * @returns {string}
     */
    getDescription() {
        return this.config.description || "Unknown tuning mode";
    }
}

module.exports = TuningStrategy;