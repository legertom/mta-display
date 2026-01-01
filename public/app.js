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

// Format occupancy status for display
function formatOccupancyStatus(occupancyStatus, occupancyPercentage, passengerCount, passengerCapacity) {
    // Check if we have any occupancy data at all
    // Note: For subways, occupancyStatus may be 0 (which means EMPTY in GTFS-RT spec)
    // but MTA doesn't actually populate this data - it's always 0, so we treat 0/0 as "no data"
    const hasOccupancyStatus = occupancyStatus !== undefined && occupancyStatus !== null;
    const hasOccupancyPercentage = occupancyPercentage !== undefined && occupancyPercentage !== null;
    const hasPassengerCount = passengerCount !== undefined && passengerCount !== null;
    
    if (!hasOccupancyStatus && !hasOccupancyPercentage && !hasPassengerCount) {
        return '';
    }
    
    // For subways: if occupancyStatus is 0 and occupancyPercentage is 0 or undefined,
    // this likely means MTA isn't providing occupancy data (not that the train is empty)
    // So we don't display it (unless we have passenger count, which is real data)
    if (hasOccupancyStatus && occupancyStatus === 0 && 
        (!hasOccupancyPercentage || occupancyPercentage === 0) && 
        !hasPassengerCount) {
        return '';
    }
    
    // GTFS-RT occupancy status values
    const statusMap = {
        0: { text: 'Empty', class: 'occupancy-empty', emoji: '🟢' },
        1: { text: 'Many Seats', class: 'occupancy-many', emoji: '🟢' },
        2: { text: 'Few Seats', class: 'occupancy-few', emoji: '🟡' },
        3: { text: 'Standing Room', class: 'occupancy-standing', emoji: '🟠' },
        4: { text: 'Crushed Standing', class: 'occupancy-crushed', emoji: '🔴' },
        5: { text: 'Full', class: 'occupancy-full', emoji: '🔴' },
        6: { text: 'Not Accepting', class: 'occupancy-not-accepting', emoji: '⚫' }
    };
    
    // Also handle SIRI occupancy string values
    const siriStatusMap = {
        'empty': { text: 'Empty', class: 'occupancy-empty', emoji: '🟢' },
        'seatsAvailable': { text: 'Many Seats', class: 'occupancy-many', emoji: '🟢' },
        'standingAvailable': { text: 'Standing Room', class: 'occupancy-standing', emoji: '🟠' },
        'full': { text: 'Full', class: 'occupancy-full', emoji: '🔴' }
    };
    
    let status;
    if (typeof occupancyStatus === 'string') {
        status = siriStatusMap[occupancyStatus.toLowerCase()] || { text: occupancyStatus, class: 'occupancy-unknown', emoji: '⚪' };
    } else {
        status = statusMap[occupancyStatus] || { text: 'Unknown', class: 'occupancy-unknown', emoji: '⚪' };
    }
    
    // Prefer passenger count if available (more specific)
    if (passengerCount !== undefined && passengerCount !== null) {
        let display = `${passengerCount} ${passengerCount === 1 ? 'rider' : 'riders'}`;
        
        // Add percentage if we have capacity data
        if (occupancyPercentage !== undefined && occupancyPercentage !== null) {
            display += ` (${occupancyPercentage}% full)`;
        } else if (passengerCapacity !== undefined && passengerCapacity !== null && passengerCapacity > 0) {
            // Calculate percentage if we have count and capacity
            const calculatedPercentage = Math.round((passengerCount / passengerCapacity) * 100);
            display += ` (${calculatedPercentage}% full)`;
        }
        
        return `<span class="occupancy-badge ${status.class}">${display}</span>`;
    }
    
    let display = status.emoji + ' ' + status.text;
    
    if (occupancyPercentage !== undefined && occupancyPercentage !== null) {
        display += ` (${occupancyPercentage}%)`;
    }
    
    return `<span class="occupancy-badge ${status.class}">${display}</span>`;
}

// Format arrival item
function createArrivalItem(arrival, isSubway = false) {
    const item = document.createElement('div');
    item.className = 'arrival-item';

    const route = isSubway ? arrival.route : arrival.route.replace('MTA NYCT_', '');
    const minutes = arrival.minutes;
    const isArriving = minutes === 0;
    
    // Get occupancy info for subway trains and buses
    let occupancyInfo = '';
    if (isSubway) {
      // For subways, check occupancyStatus (can be 0, so check !== undefined explicitly)
      if (arrival.occupancyStatus !== undefined && arrival.occupancyStatus !== null) {
        occupancyInfo = formatOccupancyStatus(arrival.occupancyStatus, arrival.occupancyPercentage, arrival.passengerCount, arrival.passengerCapacity);
      }
    } else {
      // For buses, prioritize passenger count, then occupancyStatus, then loadFactor
      // passengerCount can be 0, so check !== undefined && !== null
      if (arrival.passengerCount !== undefined && arrival.passengerCount !== null) {
        occupancyInfo = formatOccupancyStatus(arrival.occupancyStatus, arrival.occupancyPercentage, arrival.passengerCount, arrival.passengerCapacity);
      } else if (arrival.occupancyStatus !== undefined && arrival.occupancyStatus !== null) {
        occupancyInfo = formatOccupancyStatus(arrival.occupancyStatus, arrival.occupancyPercentage, null, arrival.passengerCapacity);
      } else if (arrival.loadFactor !== undefined && arrival.loadFactor !== null) {
        // Convert loadFactor (0-1) to occupancy status
        // loadFactor: 0 = empty, 0.5 = half full, 1 = full
        let occupancyStatus;
        if (arrival.loadFactor < 0.2) {
          occupancyStatus = 1; // Many seats
        } else if (arrival.loadFactor < 0.5) {
          occupancyStatus = 2; // Few seats
        } else if (arrival.loadFactor < 0.8) {
          occupancyStatus = 3; // Standing room
        } else {
          occupancyStatus = 5; // Full
        }
        const percentage = Math.round(arrival.loadFactor * 100);
        occupancyInfo = formatOccupancyStatus(occupancyStatus, percentage, null, arrival.passengerCapacity);
      }
    }
    
    // For B41, show location and service type with Limited as a badge
    let serviceInfo = '';
    if (!isSubway && arrival.location) {
      // Always show location and service type (Limited or Local)
      if (arrival.isLimited) {
        // Limited gets its own pill/badge, location shown separately
        serviceInfo = `
          <div class="arrival-service-badges">
            <span class="route-badge limited">Limited</span>
            <span class="arrival-location">at ${arrival.location}</span>
          </div>
        `;
      } else {
        // Local shows as text with location
        serviceInfo = `<div class="arrival-type">Local at ${arrival.location}</div>`;
      }
    } else if (!isSubway) {
      // Fallback if no location (shouldn't happen for B41)
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
                ${occupancyInfo ? `<div class="arrival-occupancy">${occupancyInfo}</div>` : ''}
            </div>
        </div>
        <div class="arrival-time ${isArriving ? 'arriving' : 'minutes'}">
            ${formatMinutes(minutes)}
        </div>
    `;

    return item;
}

// Update subway arrivals display
function updateSubwayArrivals(arrivals, containerId) {
    const container = document.getElementById(containerId);
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
        updateSubwayArrivals(data.subway?.churchAve || [], 'subwayArrivals');
        updateSubwayArrivals(data.subway?.winthrop || [], 'winthropArrivals');

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
    const containers = ['subwayArrivals', 'winthropArrivals', 'b41Arrivals', 'b49Arrivals'];
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
    const containers = ['subwayArrivals', 'winthropArrivals', 'b41Arrivals', 'b49Arrivals'];
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

