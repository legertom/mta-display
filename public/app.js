// Update interval (in milliseconds)
const UPDATE_INTERVAL = 30000; // 30 seconds

let updateTimer = null;

// Format minutes for display
function formatMinutes(minutes) {
    if (minutes === 0) {
        return 'Arriving';
    } else if (minutes === 1) {
        return '1 min';
    } else {
        return `${minutes} mins`;
    }
}

// Format arrival item
function createArrivalItem(arrival, isSubway = false) {
    const item = document.createElement('div');
    item.className = 'arrival-item';

    const route = isSubway ? arrival.route : arrival.route.replace('MTA NYCT_', '');
    const minutes = arrival.minutes;
    const isArriving = minutes === 0;

    item.innerHTML = `
        <div class="arrival-info">
            <div class="arrival-route">${route}</div>
            <div class="arrival-details">
                ${!isSubway && arrival.isLimited ? '<div class="arrival-type">Limited</div>' : ''}
                ${!isSubway && !arrival.isLimited ? '<div class="arrival-type">Local</div>' : ''}
            </div>
        </div>
        <div class="arrival-time ${isArriving ? 'arriving' : 'minutes'}">
            ${formatMinutes(minutes)}
        </div>
    `;

    return item;
}

// Update subway arrivals display
function updateSubwayArrivals(arrivals) {
    const container = document.getElementById('subwayArrivals');
    container.innerHTML = '';

    if (arrivals.length === 0) {
        container.innerHTML = '<div class="no-arrivals">No trains arriving soon</div>';
        return;
    }

    arrivals.forEach(arrival => {
        container.appendChild(createArrivalItem(arrival, true));
    });
}

// Update bus arrivals display
function updateBusArrivals(containerId, arrivals) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (arrivals.length === 0) {
        container.innerHTML = '<div class="no-arrivals">No buses arriving soon</div>';
        return;
    }

    arrivals.forEach(arrival => {
        container.appendChild(createArrivalItem(arrival, false));
    });
}

// Fetch and update all arrival data
async function fetchArrivals() {
    try {
        const response = await fetch('/api/arrivals');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Update subway arrivals
        updateSubwayArrivals(data.subway.churchAve);

        // Update bus arrivals
        updateBusArrivals('b41CatonArrivals', data.buses.b41Caton);
        updateBusArrivals('b41ClarksonArrivals', data.buses.b41Clarkson);
        updateBusArrivals('b49Arrivals', data.buses.b49);

        // Update last updated timestamp
        const lastUpdated = document.getElementById('lastUpdated');
        const timestamp = new Date(data.timestamp);
        lastUpdated.textContent = `Last updated: ${timestamp.toLocaleTimeString()}`;

    } catch (error) {
        console.error('Error fetching arrivals:', error);
        
        // Show error messages
        const containers = [
            'subwayArrivals',
            'b41CatonArrivals',
            'b41ClarksonArrivals',
            'b49Arrivals'
        ];

        containers.forEach(id => {
            const container = document.getElementById(id);
            container.innerHTML = `<div class="error">Error loading data. Please check your API keys.</div>`;
        });
    }
}

// Set up refresh button
document.getElementById('refreshBtn').addEventListener('click', () => {
    fetchArrivals();
});

// Initial fetch
fetchArrivals();

// Set up auto-refresh
updateTimer = setInterval(fetchArrivals, UPDATE_INTERVAL);

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (updateTimer) {
        clearInterval(updateTimer);
    }
});

