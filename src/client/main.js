import { appStore } from './modules/state/Store.js';
import { api } from './modules/api/MtaClient.js';
import { renderer } from './modules/ui/Renderer.js';

const UPDATE_INTERVAL = 30000; // 30 seconds
const THEME_CHECK_INTERVAL = 60000; // Check theme every minute

let lastFetchTime = Date.now();

// Time-based theme: Light mode 7am-8pm, Dark mode otherwise
function updateTheme() {
    const hour = new Date().getHours();
    const isDay = hour >= 7 && hour < 20; // 7am to 8pm

    if (isDay) {
        document.documentElement.classList.add('light-mode');
    } else {
        document.documentElement.classList.remove('light-mode');
    }
}

// Live clock display
function updateClock() {
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
}

// Countdown to next refresh
function updateCountdown() {
    const elapsed = Date.now() - lastFetchTime;
    const remaining = Math.max(0, Math.ceil((UPDATE_INTERVAL - elapsed) / 1000));
    const countdownEl = document.getElementById('lastUpdated');
    if (countdownEl) {
        countdownEl.textContent = `Refreshes in ${remaining}s`;
    }
}

async function updateData() {
    appStore.setState({ loading: true });

    // Update countdown display to show refreshing
    const countdownEl = document.getElementById('lastUpdated');
    if (countdownEl) {
        countdownEl.textContent = 'Refreshing...';
    }

    try {
        const data = await api.fetchArrivals();
        lastFetchTime = Date.now(); // Reset countdown
        appStore.setState({
            subway: data.subway,
            buses: data.buses,
            lastUpdated: data.timestamp,
            loading: false,
            errors: []
        });
    } catch (error) {
        console.error('Update failed:', error);
        appStore.setState({ loading: false, errors: [error.message] });
    }
}

function init() {
    console.log('🚀 MTA Display Client Starting...');

    // Initialize theme based on time
    updateTheme();
    setInterval(updateTheme, THEME_CHECK_INTERVAL);

    // Initialize clock (update every second)
    updateClock();
    setInterval(updateClock, 1000);

    // Initialize countdown (update every second)
    setInterval(updateCountdown, 1000);

    // Initialize UI
    renderer.init();

    // Initial Fetch
    updateData();

    // Poll for data
    setInterval(updateData, UPDATE_INTERVAL);

    // Manual Refresh Listener (from Renderer - keyboard shortcut)
    window.addEventListener('mta-refresh', () => {
        updateData();
    });
}

// Start
init();
