export const TimeManager = {
    init(updateInterval) {
        this.updateInterval = updateInterval;
        this.lastFetchTime = Date.now();

        // Update Clock immediately and every second
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);

        // Update Countdown every second
        setInterval(() => this.updateCountdown(), 1000);
    },

    resetCountdown() {
        this.lastFetchTime = Date.now();
        // Force update the countdown text, clearing "Refreshing..."
        const countdownEl = document.getElementById('lastUpdated');
        const remaining = Math.ceil(this.updateInterval / 1000);
        if (countdownEl) {
            countdownEl.textContent = `Refreshes in ${remaining}s`;
        }
    },

    setRefreshing() {
        const countdownEl = document.getElementById('lastUpdated');
        if (countdownEl) {
            countdownEl.textContent = 'Refreshing...';
        }
    },

    updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        const clockEl = document.getElementById('currentTime');
        if (clockEl) {
            clockEl.textContent = timeStr;
        }
    },

    updateCountdown() {
        const elapsed = Date.now() - this.lastFetchTime;
        const remaining = Math.max(0, Math.ceil((this.updateInterval - elapsed) / 1000));

        const countdownEl = document.getElementById('lastUpdated');
        // Don't overwrite "Refreshing..." text if the elapsed time is very small (just started)
        // or if we explicitly set it. But in this simple loop, we just calc remaining.
        // If remaining is 0, it usually means we are about to fetch.

        if (countdownEl && countdownEl.textContent !== 'Refreshing...') {
            countdownEl.textContent = `Refreshes in ${remaining}s`;
        }
    }
};
