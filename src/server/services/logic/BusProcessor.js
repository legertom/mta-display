/**
 * Pure logic for transforming SIRI JSON into bus arrival objects.
 */
class BusProcessor {

    /**
     * Parse SIRI JSON response
     * @param {Object} siriData - The JSON body from MTA Bus Time
     * @param {string} routeId - 'B41', etc.
     * @returns {Object} { arrivals: [], vehicleMap: Map }
     */
    parseSiri(siriData, routeId) {
        const arrivals = [];
        const vehicleMap = new Map();

        if (!siriData || !siriData.Siri) return { arrivals, vehicleMap };

        const deliveries = siriData.Siri.ServiceDelivery?.StopMonitoringDelivery || [];

        deliveries.forEach((delivery) => {
            const visits = delivery.MonitoredStopVisit || [];
            visits.forEach((visit) => {
                const journey = visit.MonitoredVehicleJourney;
                const call = journey?.MonitoredCall;

                if (!journey || !call) return;

                const arrivalTime = call.ExpectedArrivalTime || call.AimedArrivalTime;
                if (!arrivalTime) return;

                const minutes = Math.round((new Date(arrivalTime) - Date.now()) / 60000);

                // Keep extensive window (-2 to 120) to allow filters to decide later
                if (minutes >= -2 && minutes < 120) {
                    const tripId = journey.FramedVehicleJourneyRef?.DatedVehicleJourneyRef;

                    const item = this._createArrivalItem(journey, call, routeId, minutes, arrivalTime, tripId);

                    arrivals.push(item);

                    if (tripId) {
                        vehicleMap.set(tripId, {
                            occupancyStatus: journey.Occupancy,
                            passengerCount: item.passengerCount,
                        });
                    }
                }
            });
        });

        return { arrivals, vehicleMap };
    }

    _createArrivalItem(journey, call, routeId, minutes, arrivalTime, tripId) {
        const headsign = journey.DestinationName || '';
        const isLimited =
            headsign.toUpperCase().includes('LTD') ||
            headsign.toUpperCase().includes('LIMITED');

        const item = {
            route: journey.PublishedLineName || routeId,
            minutes: Math.max(0, minutes),
            isLimited,
            headsign,
            arrivalTime: new Date(arrivalTime),
            tripId,
            occupancyStatus: journey.Occupancy,
        };

        // Passenger count extension
        const cap = call.Extensions?.Capacities;
        if (cap) {
            if (cap.EstimatedPassengerCount !== undefined)
                item.passengerCount = cap.EstimatedPassengerCount;
            if (cap.EstimatedPassengerCapacity !== undefined)
                item.passengerCapacity = cap.EstimatedPassengerCapacity;
        }

        return item;
    }

    /**
     * Hydrate arrivals with vehicle data (occupancy) from a map
     * Used when we have a primary list and want to enhance it with data from another source/filter
     */
    hydrate(arrivals, vehicleMap) {
        return arrivals.map((arrival) => {
            if (arrival.tripId && vehicleMap.has(arrival.tripId)) {
                const vData = vehicleMap.get(arrival.tripId);
                return { ...arrival, ...vData };
            }
            return arrival;
        });
    }
}

module.exports = new BusProcessor();
