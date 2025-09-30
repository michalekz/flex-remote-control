const TuningStrategy = require('./TuningStrategy');

/**
 * Fixed step tuning strategy (Mód A - Fine and Coarse)
 *
 * Returns constant Hz per pulse regardless of velocity.
 * Used for predictable, fixed-rate frequency changes.
 *
 * Examples:
 * - ModeA_Fine: 4.07 Hz/pulse (1 kHz per rotation)
 * - ModeA_Coarse: 20.33 Hz/pulse (5 kHz per rotation)
 */
class FixedStepStrategy extends TuningStrategy {
    constructor(config) {
        super(config);
        this.hzPerPulse = config.hzPerPulse;
        this.throttle = config.throttle || 50;
    }

    /**
     * Calculate Hz per pulse (always returns fixed value)
     * @param {number} velocity - Events per second (ignored)
     * @returns {number} Hz per pulse
     */
    calculateHzPerPulse(velocity) {
        // Ignore velocity, always return fixed value
        return this.hzPerPulse;
    }

    /**
     * Get throttle interval (always returns fixed value)
     * @param {number} velocity - Events per second (ignored)
     * @returns {number} Throttle in milliseconds
     */
    getThrottle(velocity) {
        // Fixed throttle
        return this.throttle;
    }
}

module.exports = FixedStepStrategy;