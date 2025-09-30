const TuningStrategy = require('./TuningStrategy');

/**
 * Velocity-based tuning strategy (Mód B)
 *
 * Hz per pulse interpolated based on velocity using anchor points.
 * Provides smooth, continuous transition between slow/medium/fast tuning rates.
 *
 * Example anchor points:
 * - Slow (75 ev/s): 4.07 Hz/pulse (1 kHz per rotation)
 * - Medium (250 ev/s): 20.33 Hz/pulse (5 kHz per rotation)
 * - Fast (650 ev/s): 40.65 Hz/pulse (10 kHz per rotation)
 *
 * Between anchor points, values are interpolated linearly or exponentially.
 */
class VelocityBasedStrategy extends TuningStrategy {
    constructor(config) {
        super(config);
        this.anchorPoints = config.anchorPoints;
        this.interpolation = config.interpolation || 'linear';

        // Sort anchor points by velocity (ascending)
        this.anchorPoints.sort((a, b) => a.velocity - b.velocity);
    }

    /**
     * Calculate Hz per pulse based on velocity
     * Uses interpolation between anchor points for smooth transition
     * @param {number} velocity - Events per second
     * @returns {number} Hz per pulse
     */
    calculateHzPerPulse(velocity) {
        // Find two nearest anchor points
        let lowerPoint = null;
        let upperPoint = null;

        for (let i = 0; i < this.anchorPoints.length - 1; i++) {
            if (velocity >= this.anchorPoints[i].velocity &&
                velocity <= this.anchorPoints[i + 1].velocity) {
                lowerPoint = this.anchorPoints[i];
                upperPoint = this.anchorPoints[i + 1];
                break;
            }
        }

        // Clamping: velocity outside range
        if (!lowerPoint) {
            if (velocity < this.anchorPoints[0].velocity) {
                // Below minimum velocity → use slowest anchor point
                return this.anchorPoints[0].hzPerPulse;
            } else {
                // Above maximum velocity → use fastest anchor point
                return this.anchorPoints[this.anchorPoints.length - 1].hzPerPulse;
            }
        }

        // Interpolate between anchor points
        return this.interpolate(velocity, lowerPoint, upperPoint);
    }

    /**
     * Interpolate Hz value between two anchor points
     * @param {number} velocity - Current velocity
     * @param {object} lower - Lower anchor point
     * @param {object} upper - Upper anchor point
     * @returns {number} Interpolated Hz per pulse
     */
    interpolate(velocity, lower, upper) {
        switch (this.interpolation) {
            case 'linear':
                return this.linearInterpolate(velocity, lower, upper);
            case 'exponential':
                return this.exponentialInterpolate(velocity, lower, upper);
            default:
                return this.linearInterpolate(velocity, lower, upper);
        }
    }

    /**
     * Linear interpolation between two points
     * @param {number} velocity - Current velocity
     * @param {object} lower - Lower anchor point
     * @param {object} upper - Upper anchor point
     * @returns {number} Interpolated Hz per pulse
     */
    linearInterpolate(velocity, lower, upper) {
        const ratio = (velocity - lower.velocity) / (upper.velocity - lower.velocity);
        return lower.hzPerPulse + ratio * (upper.hzPerPulse - lower.hzPerPulse);
    }

    /**
     * Exponential interpolation between two points
     * Provides faster growth at higher velocities
     * @param {number} velocity - Current velocity
     * @param {object} lower - Lower anchor point
     * @param {object} upper - Upper anchor point
     * @returns {number} Interpolated Hz per pulse
     */
    exponentialInterpolate(velocity, lower, upper) {
        const ratio = (velocity - lower.velocity) / (upper.velocity - lower.velocity);
        return lower.hzPerPulse * Math.pow(upper.hzPerPulse / lower.hzPerPulse, ratio);
    }

    /**
     * Get adaptive throttle based on velocity
     * Uses throttle value from nearest anchor point
     * @param {number} velocity - Events per second
     * @returns {number} Throttle in milliseconds
     */
    getThrottle(velocity) {
        // Find nearest anchor point
        let nearestPoint = this.anchorPoints[0];
        let minDistance = Math.abs(velocity - nearestPoint.velocity);

        for (const point of this.anchorPoints) {
            const distance = Math.abs(velocity - point.velocity);
            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = point;
            }
        }

        return nearestPoint.throttle || 100;
    }
}

module.exports = VelocityBasedStrategy;