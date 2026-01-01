// Update interval (in milliseconds)
const UPDATE_INTERVAL = 30000; // 30 seconds

let updateTimer = null;

// Subway filter state - which routes are active
const SUBWAY_FILTER_KEY = 'mta-subway-filters';
let activeSubwayRoutes = new Set(['B', 'Q', '2', '5']);

// Bus filter state
const BUS_FILTER_KEY = 'mta-bus-filters';
let activeBusRoutes = new Set(['B41', 'B49']);

// Section visibility state
const SECTION_VISIBILITY_KEY = 'mta-section-visibility';
let visibleSections = new Set(['subway', 'bus']);

// Load filter preferences from localStorage
function loadFilterPreferences() {
    try {
        const savedSubway = localStorage.getItem(SUBWAY_FILTER_KEY);
        if (savedSubway) {
            const routes = JSON.parse(savedSubway);
            activeSubwayRoutes = new Set(routes);
        }
        const savedBus = localStorage.getItem(BUS_FILTER_KEY);
        if (savedBus) {
            const routes = JSON.parse(savedBus);
            activeBusRoutes = new Set(routes);
        }
        const savedSections = localStorage.getItem(SECTION_VISIBILITY_KEY);
        if (savedSections) {
            const sections = JSON.parse(savedSections);
            visibleSections = new Set(sections);
        }
    } catch (e) {
        console.warn('Could not load filter preferences:', e);
    }
    updateFilterBadgeUI();
    updateSectionVisibility();
}

// Save filter preferences to localStorage
function saveFilterPreferences() {
    try {
        localStorage.setItem(SUBWAY_FILTER_KEY, JSON.stringify([...activeSubwayRoutes]));
        localStorage.setItem(BUS_FILTER_KEY, JSON.stringify([...activeBusRoutes]));
        localStorage.setItem(SECTION_VISIBILITY_KEY, JSON.stringify([...visibleSections]));
    } catch (e) {
        console.warn('Could not save filter preferences:', e);
    }
}

// Update section visibility UI
function updateSectionVisibility() {
    // Update toggle buttons
    document.querySelectorAll('.section-toggle').forEach(toggle => {
        const section = toggle.dataset.section;
        if (visibleSections.has(section)) {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    });

    // Update section visibility
    const subwaySection = document.querySelector('.subway-section-full');
    const busSection = document.querySelector('.bus-section-full');

    if (subwaySection) {
        subwaySection.classList.toggle('hidden', !visibleSections.has('subway'));
    }
    if (busSection) {
        busSection.classList.toggle('hidden', !visibleSections.has('bus'));
    }
}

// Toggle section visibility
function toggleSection(section) {
    if (visibleSections.has(section)) {
        // Don't allow hiding all sections
        if (visibleSections.size > 1) {
            visibleSections.delete(section);
        }
    } else {
        visibleSections.add(section);
    }
    saveFilterPreferences();
    updateSectionVisibility();
}

// Update filter badge UI to match state
function updateFilterBadgeUI() {
    document.querySelectorAll('.filter-badge').forEach(badge => {
        const route = badge.dataset.route;
        const isBus = badge.classList.contains('bus-filter');
        const activeSet = isBus ? activeBusRoutes : activeSubwayRoutes;

        if (activeSet.has(route)) {
            badge.classList.add('active');
        } else {
            badge.classList.remove('active');
        }
    });
}

// Toggle a subway route filter
function toggleSubwayRoute(route) {
    if (activeSubwayRoutes.has(route)) {
        // Don't allow turning off all routes
        if (activeSubwayRoutes.size > 1) {
            activeSubwayRoutes.delete(route);
        }
    } else {
        activeSubwayRoutes.add(route);
    }
    saveFilterPreferences();
    updateFilterBadgeUI();
        // Re-render with current data
        if (lastSubwayData) {
            renderFilteredSubwayArrivals(lastSubwayData);
        }
}

// Store last fetched data for re-filtering
let lastSubwayData = null;
let lastBusData = null;
let lastTimesSquareData = null;
let timesSquareMap = {}; // Map of tripId -> Times Square arrival info

// Combine and filter subway arrivals
function renderFilteredSubwayArrivals(subwayData) {
    lastSubwayData = subwayData;

    // Combine arrivals from both stations
    const allArrivals = [
        ...(subwayData.churchAve || []).map(a => ({ ...a, station: 'Church Ave' })),
        ...(subwayData.winthrop || []).map(a => ({ ...a, station: 'Winthrop St' }))
    ];

    // Filter by active routes
    const filtered = allArrivals.filter(a => activeSubwayRoutes.has(a.route));

    // Sort by minutes
    filtered.sort((a, b) => a.minutes - b.minutes);

    // Update display
    updateSubwayArrivals(filtered, 'subwayArrivals');
}

// Toggle a bus route filter
function toggleBusRoute(route) {
    if (activeBusRoutes.has(route)) {
        // Don't allow turning off all routes
        if (activeBusRoutes.size > 1) {
            activeBusRoutes.delete(route);
        }
    } else {
        activeBusRoutes.add(route);
    }
    saveFilterPreferences();
    updateFilterBadgeUI();
    // Re-render with current data
    if (lastBusData) {
        renderFilteredBusArrivals(lastBusData);
    }
}

// Combine and filter bus arrivals
function renderFilteredBusArrivals(busData) {
    lastBusData = busData;

    // Combine arrivals from both routes
    const allArrivals = [
        ...(busData.b41 || []).map(a => ({ ...a, busRoute: 'B41' })),
        ...(busData.b49 || []).map(a => ({ ...a, busRoute: 'B49' }))
    ];

    // Filter by active routes
    const filtered = allArrivals.filter(a => activeBusRoutes.has(a.busRoute));

    // Sort by minutes
    filtered.sort((a, b) => a.minutes - b.minutes);

    // Update display
    updateBusArrivals('busArrivals', filtered);
}


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
    
    // Calculate percentage for status bar
    let percentage = null;
    if (occupancyPercentage !== undefined && occupancyPercentage !== null) {
        percentage = Math.max(0, Math.min(100, occupancyPercentage));
    } else if (passengerCapacity !== undefined && passengerCapacity !== null && passengerCapacity > 0 && passengerCount !== undefined && passengerCount !== null) {
        percentage = Math.max(0, Math.min(100, Math.round((passengerCount / passengerCapacity) * 100)));
    }
    
    // Determine status bar color based on percentage
    let statusBarClass = 'status-bar-low';
    if (percentage !== null) {
        if (percentage >= 80) {
            statusBarClass = 'status-bar-high';
        } else if (percentage >= 50) {
            statusBarClass = 'status-bar-medium';
        }
    }
    
    // Build status bar HTML - just the bar, no text labels
    let statusBarHtml = '';
    if (percentage !== null) {
        statusBarHtml = `
            <div class="occupancy-status-bar">
                <div class="status-bar-container">
                    <div class="status-bar-fill ${statusBarClass}" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }
    
    // Return just the status bar (no rider count or percentage text)
    if (statusBarHtml) {
        return `<div class="occupancy-info">${statusBarHtml}</div>`;
    }
    
    // Fallback: if no percentage data, return empty
    return '';
}

// Get subway route badge class
function getSubwayBadgeClass(route) {
    const routeMap = {
        'B': 'subway-b',
        'Q': 'subway-q',
        '2': 'subway-2',
        '5': 'subway-5',
        'N': 'subway-n',
        'R': 'subway-r',
        'W': 'subway-w',
        '1': 'subway-1',
        '3': 'subway-3',
        '4': 'subway-4',
        '6': 'subway-6',
        '7': 'subway-7',
        'A': 'subway-a',
        'C': 'subway-c',
        'E': 'subway-e',
        'D': 'subway-d',
        'F': 'subway-f',
        'M': 'subway-m',
        'G': 'subway-g',
        'J': 'subway-j',
        'Z': 'subway-z',
        'L': 'subway-l',
        'S': 'subway-s'
    };
    return routeMap[route] || 'subway-default';
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
    
    // For buses, show location with subtle Limited indicator if applicable
    let serviceInfo = '';
    if (!isSubway && arrival.location) {
      if (arrival.isLimited) {
        // Limited: show small "Ltd" indicator before location
        serviceInfo = `
          <div class="arrival-type">
            <span class="service-indicator">Ltd</span>${arrival.location}
          </div>
        `;
      } else {
        // Local: just show location (Local is assumed default)
        serviceInfo = `<div class="arrival-type">${arrival.location}</div>`;
      }
    } else if (!isSubway) {
      // Fallback if no location
      if (arrival.isLimited) {
        serviceInfo = '<div class="arrival-type"><span class="service-indicator">Ltd</span></div>';
      } else {
        serviceInfo = '';
      }
    }

    // Create route display - circular badge for subway, regular for bus
    let routeDisplay;
    let timesSquareInfo = '';
    let isClickable = false;
    
    if (isSubway) {
        const badgeClass = getSubwayBadgeClass(route);
        routeDisplay = `<span class="route-badge ${badgeClass}">${route}</span>`;
        // Show station for subway arrivals
        if (arrival.station) {
            serviceInfo = `<div class="arrival-type">${arrival.station}</div>`;
        }
        
        // Check if this train goes to Times Square (Q, 2, or 5 trains)
        // Make ALL Q, 2, and 5 trains clickable - they all go to Times Square!
        const goesToTimesSquare = (route === 'Q' || route === '2' || route === '5');
        if (goesToTimesSquare) {
            isClickable = true;
            
            // First check if Times Square data is embedded in the arrival (from same trip update)
            if (arrival.timesSquareArrival) {
                const tsqData = arrival.timesSquareArrival;
                const tsqTime = tsqData.arrivalTime instanceof Date
                    ? tsqData.arrivalTime
                    : new Date(tsqData.arrivalTime);
                const timeStr = tsqTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                timesSquareInfo = `
                    <div class="times-square-info" style="display: none;">
                        <div class="times-square-label">→ Times Square:</div>
                        <div class="times-square-time">${timeStr}</div>
                    </div>
                `;
            }
            // Otherwise check the timesSquareMap (from separate Times Square fetch)
            else if (arrival.tripId && timesSquareMap[arrival.tripId]) {
                const tsqData = timesSquareMap[arrival.tripId];
                // Handle both Date objects and ISO strings
                const tsqTime = tsqData.arrivalTime instanceof Date
                    ? tsqData.arrivalTime
                    : new Date(tsqData.arrivalTime);
                const timeStr = tsqTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                timesSquareInfo = `
                    <div class="times-square-info" style="display: none;">
                        <div class="times-square-label">→ Times Square:</div>
                        <div class="times-square-time">${timeStr}</div>
                    </div>
                `;
            } else {
                // Train goes to Times Square but we don't have specific arrival data
                // Calculate estimated time based on typical travel times
                // Q train: Church Ave to Times Square is approximately 28 minutes (or 38 if local)
                // 2/5 train: Winthrop St to Times Square is approximately 38 minutes
                const estimatedMinutes = route === 'Q'
                    ? minutes + 28  // Q train estimate (backend handles local/express)
                    : minutes + 38;  // 2/5 train estimate

                // Ensure arrivalTime is a Date object
                const arrivalTimeDate = arrival.arrivalTime instanceof Date
                    ? arrival.arrivalTime
                    : new Date(arrival.arrivalTime);

                const estimatedArrivalTime = new Date(arrivalTimeDate.getTime() + (estimatedMinutes - minutes) * 60000);
                const timeStr = estimatedArrivalTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                timesSquareInfo = `
                    <div class="times-square-info" style="display: none;">
                        <div class="times-square-label">→ Times Square:</div>
                        <div class="times-square-time">${timeStr}</div>
                    </div>
                `;
            }
        }
    } else {
        routeDisplay = `<div class="arrival-route">${route}</div>`;
    }

    item.innerHTML = `
        <div class="arrival-info">
            ${routeDisplay}
            <div class="arrival-details">
                ${serviceInfo}
                ${occupancyInfo ? `<div class="arrival-occupancy">${occupancyInfo}</div>` : ''}
                ${timesSquareInfo}
            </div>
        </div>
        <div class="arrival-time ${isArriving ? 'arriving' : 'minutes'}">
            ${formatMinutes(minutes)}
        </div>
    `;

    // Add clickable class and handler for trains that go to Times Square
    // Do this AFTER setting innerHTML so the elements exist
    if (isClickable) {
        item.classList.add('clickable-train');
        if (arrival.tripId) {
            item.setAttribute('data-trip-id', arrival.tripId);
        }
        item.setAttribute('title', 'Click to see Times Square arrival time');
        
        // Add click handler after innerHTML is set
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const tsqInfo = item.querySelector('.times-square-info');
            if (tsqInfo) {
                const isVisible = tsqInfo.style.display !== 'none';
                tsqInfo.style.display = isVisible ? 'none' : 'block';
                item.classList.toggle('expanded', !isVisible);
            }
        });
        
        // Note: tripId may be missing, but train is still clickable with estimated times
    }

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

        // Store Times Square map for looking up train arrivals
        timesSquareMap = data.subway?.timesSquareMap || {};

        // Update subway arrivals with filtering
        renderFilteredSubwayArrivals(data.subway || {});

        // Update bus arrivals with filtering
        renderFilteredBusArrivals(data.buses || {});

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
    const containers = ['subwayArrivals', 'busArrivals'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = '<div class="loading">Loading...</div>';
        }
    });

    const lastUpdated = document.getElementById('lastUpdated');
    lastUpdated.textContent = 'Connecting...';
    lastUpdated.className = 'last-updated loading';
}

// Show error state with helpful message
function showErrorState(message) {
    const containers = ['subwayArrivals', 'busArrivals'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = `
                <div class="error">
                    <div class="error-icon">⚠️</div>
                    <div class="error-message">${message}</div>
                    <div class="error-hint">Click refresh to try again</div>
                </div>
            `;
        }
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

// Set up filter badge click handlers
document.querySelectorAll('.filter-badge').forEach(badge => {
    badge.addEventListener('click', () => {
        const route = badge.dataset.route;
        if (badge.classList.contains('bus-filter')) {
            toggleBusRoute(route);
        } else {
            toggleSubwayRoute(route);
        }
    });
});

// Set up section toggle click handlers
document.querySelectorAll('.section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        toggleSection(toggle.dataset.section);
    });
});

// Load filter preferences
loadFilterPreferences();

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

