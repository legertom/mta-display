export function formatMinutes(minutes) {
    if (minutes === 0) return 'Arriving';
    if (minutes === 1) return '1 min';
    return `${minutes} mins`;
}

export function formatOccupancy(status) {
    const statusMap = {
        0: null, // Don't display "Empty" badge
        1: { text: 'Many Seats', color: 'green' },
        2: { text: 'Few Seats', color: 'yellow' },
        3: { text: 'Standing Room', color: 'orange' },
        5: { text: 'Full', color: 'red' },
    };

    // Handle SIRI string values if they come through raw
    if (typeof status === 'string') {
        const lower = status.toLowerCase();
        if (lower.includes('seats')) return { text: 'Seats', color: 'green' };
        if (lower.includes('full')) return { text: 'Full', color: 'red' };
    }

    return statusMap[status] || null;
}

/**
 * Calculates bus occupancy visual properties
 * @returns {{ percent: number, label: string, barColor: string } | null}
 */
export function getBusOccupancy(passengerCount, capacity, occupancyStatus) {
    // If no data, return null to hide component
    if (!passengerCount && !capacity && !occupancyStatus) return null;

    let percent = 0;
    let label = '';

    if (capacity && passengerCount !== undefined) {
        percent = Math.min(100, Math.round((passengerCount / capacity) * 100));
        label = `${passengerCount}/${capacity}`;
    } else if (occupancyStatus) {
        const status = String(occupancyStatus).toLowerCase();
        if (status.includes('empty') || status.includes('many')) {
            percent = 20;
            label = 'Empty';
        } else if (status.includes('few')) {
            percent = 50;
            label = 'Seats';
        } else if (status.includes('standing')) {
            percent = 80;
            label = 'Standing';
        } else if (status.includes('full') || status.includes('crushed')) {
            percent = 100;
            label = 'Full';
        } else {
            percent = 30;
            label = '';
        }
    }

    // Color based on fill level
    let barColor = 'var(--status-low)';  // Green
    if (percent > 50) barColor = 'var(--status-medium)';  // Yellow
    if (percent > 80) barColor = 'var(--status-high)';  // Red

    return { percent, label, barColor };
}

export function getSubwayOccupancyColor(colorName) {
    const colors = {
        green: { bg: '#d4edda', text: '#155724' },
        yellow: { bg: '#fff3cd', text: '#856404' },
        orange: { bg: '#ffeeba', text: '#856404' }, // Fallback for orange
        red: { bg: '#f8d7da', text: '#721c24' },
    };
    return colors[colorName] || colors.red;
}

export function formatDestinationArrival(destMinutes, destLabel) {
    if (!destMinutes || !destLabel) return null;

    const now = new Date();
    const arrivalTime = new Date(now.getTime() + destMinutes * 60000);
    const timeStr = arrivalTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).toLowerCase();

    return `${destLabel} ${timeStr}`;
}
