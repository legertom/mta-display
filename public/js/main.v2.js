import { appStore } from './modules/state/Store.js';
import { api } from './modules/api/MtaClient.js';
import { renderer } from './modules/ui/Renderer.js';
import { ThemeManager } from './modules/ui/ThemeManager.js';
import { TimeManager } from './modules/ui/TimeManager.js';
import { FilterManager } from './modules/ui/FilterManager.js';

const UPDATE_INTERVAL = 30000; // 30 seconds

async function updateData() {
    appStore.setState({ loading: true });
    TimeManager.setRefreshing();

    try {
        const data = await api.fetchArrivals();
        TimeManager.resetCountdown();

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
    console.log('🚀 MTA Display Loaded: Dynamic Destination Support (v2)');

    // 1. Initialize Managers
    ThemeManager.init();
    TimeManager.init(UPDATE_INTERVAL);
    FilterManager.init();
    renderer.init();

    // 2. Initial Fetch
    updateData();

    // 3. Poll for data
    setInterval(updateData, UPDATE_INTERVAL);

    // 4. Manual Refresh Listener
    window.addEventListener('mta-refresh', () => {
        updateData();
    });
}

// Start
init();
