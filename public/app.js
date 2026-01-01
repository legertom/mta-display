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
    
    // For B41, show location and service type with Limited as a badge
    let serviceInfo = '';
    if (!isSubway && arrival.location) {
      if (arrival.isLimited) {
        // Limited gets its own pill/badge, location shown separately
        serviceInfo = `
          <div class="arrival-service-badges">
            <span class="route-badge limited">Limited</span>
            <span class="arrival-location">at ${arrival.location}</span>
          </div>
        `;
      } else {
        // Local just shows location
        serviceInfo = `<div class="arrival-type">Local at ${arrival.location}</div>`;
      }
    } else if (!isSubway) {
      if (arrival.isLimited) {
        serviceInfo = '<span class="route-badge limited">Limited</span>';
      } else {
        serviceInfo = '<div class="arrival-type">Local</div>';
      }
    }

    item.innerHTML = `
        <div class="arrival-info">
            <div class="arrival-route">${route}</div>
            <div class="arrival-details">
                ${serviceInfo}
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

// Fetch and update all arrival data with retry logic
async function fetchArrivals(retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds

    try {
        const response = await fetch('/api/arrivals', {
            signal: AbortSignal.timeout(15000) // 15 second timeout
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Handle partial data gracefully
        if (data.errors && data.errors.length > 0) {
            console.warn('Partial data received:', data.warnings);
        }

        // Update subway arrivals (even if empty)
        updateSubwayArrivals(data.subway?.churchAve || []);

        // Update bus arrivals (even if empty)
        updateBusArrivals('b41Arrivals', data.buses?.b41 || []);
        updateBusArrivals('b49Arrivals', data.buses?.b49 || []);

        // Show warnings if any services failed
        if (data.warnings && data.warnings.length > 0) {
            showServiceWarnings(data.warnings);
        } else {
            clearServiceWarnings();
        }

        // Update last updated timestamp
        const lastUpdated = document.getElementById('lastUpdated');
        const timestamp = new Date(data.timestamp);
        lastUpdated.textContent = `Last updated: ${timestamp.toLocaleTimeString()}`;
        lastUpdated.className = 'last-updated';

    } catch (error) {
        console.error('Error fetching arrivals:', error);
        
        // Retry logic for transient errors
        if (retryCount < MAX_RETRIES && (
            error.name === 'TypeError' || // Network error
            error.name === 'AbortError' || // Timeout
            error.message.includes('Failed to fetch')
        )) {
            console.log(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            setTimeout(() => fetchArrivals(retryCount + 1), RETRY_DELAY);
            showLoadingState();
            return;
        }

        // Show user-friendly error messages
        showErrorState(error.message || 'Unable to load arrival data. Please try again.');
    }
}

// Show loading state
function showLoadingState() {
    const containers = ['subwayArrivals', 'b41Arrivals', 'b49Arrivals'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        container.innerHTML = '<div class="loading">Loading...</div>';
    });
    
    const lastUpdated = document.getElementById('lastUpdated');
    lastUpdated.textContent = 'Connecting...';
    lastUpdated.className = 'last-updated loading';
}

// Show error state with helpful message
function showErrorState(message) {
    const containers = ['subwayArrivals', 'b41Arrivals', 'b49Arrivals'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        container.innerHTML = `
            <div class="error">
                <div class="error-icon">⚠️</div>
                <div class="error-message">${message}</div>
                <div class="error-hint">Click refresh to try again</div>
            </div>
        `;
    });
    
    const lastUpdated = document.getElementById('lastUpdated');
    lastUpdated.textContent = 'Last update failed';
    lastUpdated.className = 'last-updated error';
}

// Show service warnings
function showServiceWarnings(warnings) {
    // Create or update warning banner
    let warningBanner = document.getElementById('serviceWarnings');
    if (!warningBanner) {
        warningBanner = document.createElement('div');
        warningBanner.id = 'serviceWarnings';
        warningBanner.className = 'service-warnings';
        const header = document.querySelector('header');
        header.appendChild(warningBanner);
    }
    warningBanner.innerHTML = `
        <span class="warning-icon">ℹ️</span>
        <span class="warning-text">${warnings.join('; ')}</span>
    `;
    warningBanner.style.display = 'flex';
}

// Clear service warnings
function clearServiceWarnings() {
    const warningBanner = document.getElementById('serviceWarnings');
    if (warningBanner) {
        warningBanner.style.display = 'none';
    }
}

// Set up refresh button with loading state
document.getElementById('refreshBtn').addEventListener('click', () => {
    const btn = document.getElementById('refreshBtn');
    const originalText = btn.textContent;
    btn.textContent = '🔄 Refreshing...';
    btn.disabled = true;
    
    fetchArrivals().finally(() => {
        btn.textContent = originalText;
        btn.disabled = false;
    });
});

// Initial fetch with loading state
showLoadingState();
fetchArrivals();

// Set up auto-refresh
updateTimer = setInterval(fetchArrivals, UPDATE_INTERVAL);

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (updateTimer) {
        clearInterval(updateTimer);
    }
});

