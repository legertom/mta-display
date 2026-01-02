/**
 * Business rules and filtering logic.
 */
class ArrivalFilters {

    /**
     * Filter specifically for B41 Rules:
     * - Combine Caton and Clarkson results.
     * - Filter Clarkson to ONLY show Limited.
     * - Deduplicate by tripId (prefer Caton/First appearance).
     */
    processB41(b41Caton, b41Clarkson) {
        // Rule: Clarkson only shows Limited
        const clarksonLimited = b41Clarkson.filter(a => a.isLimited);

        // Combine: Caton first
        const allB41 = [
            ...b41Caton.map((a) => ({ ...a, location: 'Caton Ave' })),
            ...clarksonLimited.map((a) => ({ ...a, location: 'Clarkson Ave' })),
        ];

        // Deduplicate
        const unique = [];
        const seenTrips = new Set();

        for (const bus of allB41) {
            if (bus.tripId) {
                if (!seenTrips.has(bus.tripId)) {
                    seenTrips.add(bus.tripId);
                    unique.push(bus);
                }
            } else {
                // If no tripId, assume unique
                unique.push(bus);
            }
        }

        return this.sortAndFilter(unique);
    }

    /**
     * Filter by Headsign / Direction
     */
    filterByDirection(arrivals, filterString) {
        if (!filterString) return arrivals;

        const filter = filterString.toLowerCase();
        return arrivals.filter((a) => {
            const headsign = (a.headsign || '').toLowerCase();
            return (
                headsign.includes(filter) ||
                headsign.includes('bed stuy') ||
                headsign.includes('bed-stuy')
            );
        });
    }

    /**
     * General Sorter: sort by minutes, cap at maxMinutes
     */
    sortAndFilter(arrivals, maxMinutes = 30) {
        return arrivals
            .sort((a, b) => a.minutes - b.minutes)
            .filter((a) => a.minutes <= maxMinutes);
    }
}

module.exports = new ArrivalFilters();
