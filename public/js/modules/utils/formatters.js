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
