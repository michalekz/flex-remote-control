/**
 * Jog wheel accumulator with velocity detection
 *
 * Maintains current frequency state and velocity history for jog wheel events.
 * Key features:
 * - Accumulates frequency changes without queueing events
 * - Calculates velocity using moving average over smoothing window
 * - Detects stop condition (no events for > stopThreshold)
 * - Supports pause/resume for integration with button events
 *
 * Based on measurements:
 * - Encoder resolution: 246 pulses/rotation
 * - Velocity levels: 75 ev/s (slow), 250 ev/s (medium), 650 ev/s (fast)
 */
class JogAccumulator {
    constructor(config) {
        this.config = config;
        this.currentFrequency = 0;
        this.lastSentFrequency = 0;
        this.velocityHistory = [];
        this.smoothingWindow = config.smoothingWindow || 10;
        this.stopThreshold = config.stopThreshold || 150; // ms
        this.isPaused = false;
        this.pausedUntil = 0;
    }

    /**
     * Add new jog wheel event
     * Updates frequency and velocity history
     * @param {number} direction - +1 (clockwise) or -1 (counter-clockwise)
     * @param {number} hzPerPulse - Current tuning step size (from strategy)
     * @param {number} timestamp - Event timestamp in milliseconds
     */
    addEvent(direction, hzPerPulse, timestamp) {
        if (this.isPaused && timestamp < this.pausedUntil) {
            return; // Still paused
        }

        this.isPaused = false;

        // Update accumulated frequency
        this.currentFrequency += direction * hzPerPulse;

        // Store event for velocity calculation
        this.velocityHistory.push({ timestamp, direction });

        // Keep only recent history (smoothing window)
        if (this.velocityHistory.length > this.smoothingWindow) {
            this.velocityHistory.shift();
        }
    }

    /**
     * Calculate current velocity (events per second)
     * Uses moving average over smoothing window to eliminate jitter
     * @returns {number} Events per second
     */
    getVelocity() {
        if (this.velocityHistory.length < 2) {
            return 0;
        }

        // Calculate delta times between consecutive events
        const deltaTimes = [];
        for (let i = 1; i < this.velocityHistory.length; i++) {
            deltaTimes.push(
                this.velocityHistory[i].timestamp - this.velocityHistory[i - 1].timestamp
            );
        }

        // Average delta time (ms)
        const avgDeltaTime = deltaTimes.reduce((a, b) => a + b, 0) / deltaTimes.length;

        // Convert to events per second
        // ev/s = 1000 ms/s ÷ avg ms/event
        return avgDeltaTime > 0 ? 1000 / avgDeltaTime : 0;
    }

    /**
     * Check if frequency has changed since last send
     * @returns {boolean} True if there are unsent frequency changes
     */
    hasChange() {
        return Math.abs(this.currentFrequency - this.lastSentFrequency) > 0;
    }

    /**
     * Get current frequency and mark as sent
     * Call this when actually sending frequency to FlexRadio
     * @returns {number} Frequency in Hz
     */
    getFrequencyAndMark() {
        this.lastSentFrequency = this.currentFrequency;
        return this.currentFrequency;
    }

    /**
     * Detect if user stopped rotating jog wheel
     * Returns true if no events received for > stopThreshold
     * Used to send final frequency immediately (bypass throttle)
     * @returns {boolean} True if rotation stopped
     */
    shouldStop() {
        if (this.velocityHistory.length === 0) {
            return false;
        }

        const lastEventTime = this.velocityHistory[this.velocityHistory.length - 1].timestamp;
        const timeSinceLastEvent = Date.now() - lastEventTime;

        return timeSinceLastEvent > this.stopThreshold;
    }

    /**
     * Pause accumulator for specified duration
     * Used when button event needs priority (e.g., mode change, slice change)
     * @param {number} durationMs - Pause duration in milliseconds
     */
    pause(durationMs) {
        this.isPaused = true;
        this.pausedUntil = Date.now() + durationMs;
    }

    /**
     * Reset accumulator state
     * Used when changing slices or other major state changes
     */
    reset() {
        this.currentFrequency = 0;
        this.lastSentFrequency = 0;
        this.velocityHistory = [];
    }

    /**
     * Set base frequency
     * Used when loading slice, direct frequency entry, or absolute frequency changes
     * @param {number} frequency - Base frequency in Hz
     */
    setBaseFrequency(frequency) {
        this.currentFrequency = frequency;
        this.lastSentFrequency = frequency;
        // Don't clear velocity history - keep for velocity detection
    }

    /**
     * Get current accumulated frequency (without marking as sent)
     * Used for display or debugging
     * @returns {number} Current frequency in Hz
     */
    getCurrentFrequency() {
        return this.currentFrequency;
    }
}

module.exports = JogAccumulator;