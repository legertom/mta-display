const gtfs = require('gtfs-realtime-bindings');
const { DESTINATION_STOPS } = require('../../config/constants');

/**
 * Pure logic for transforming raw GTFS buffers into domain arrival objects.
 */
class SubwayProcessor {

    /**
     * Parse GTFS Buffer into Arrivals
     * @param {Buffer} buffer - Raw protobuf
     * @param {string} routeId - 'Q', 'B', etc.
     * @param {string} stopId - 'D28'
     * @param {string[]} stopIdPatterns - ['D28', 'N']
     * @returns {Array} List of arrivals
     */
    parse(buffer, routeId, stopId, stopIdPatterns) {
        if (!buffer) return [];

        try {
            const feed = gtfs.transit_realtime.FeedMessage.decode(buffer);
            const vehiclePositions = this._extractVehiclePositions(feed, routeId);
            return this._extractArrivals(feed, routeId, stopId, stopIdPatterns, vehiclePositions);
        } catch (error) {
            console.error(`[SubwayProcessor] Parse Error (${routeId}):`, error.message);
            return [];
        }
    }

    /**
     * Pass 1: Map Trip IDs to Occupancy Status
     */
    _extractVehiclePositions(feed, targetRoute) {
        const positions = new Map();
        feed.entity.forEach((entity) => {
            if (
                entity.vehicle &&
                entity.vehicle.trip &&
                entity.vehicle.trip.routeId === targetRoute
            ) {
                const tripId = entity.vehicle.trip.tripId;
                positions.set(tripId, {
                    occupancyStatus: entity.vehicle.occupancyStatus,
                    occupancyPercentage: entity.vehicle.occupancyPercentage,
                });
            }
        });
        return positions;
    }

    /**
     * Pass 2: Process Trip Updates to find relevant arrivals
     */
    _extractArrivals(feed, targetRoute, stopId, stopIdPatterns, vehiclePositions) {
        const arrivals = [];
        const now = Math.floor(Date.now() / 1000);

        feed.entity.forEach((entity) => {
            if (
                entity.tripUpdate &&
                entity.tripUpdate.stopTimeUpdate &&
                entity.tripUpdate.trip.routeId === targetRoute
            ) {
                const tripId = entity.tripUpdate.trip.tripId;
                const vehicleData = vehiclePositions.get(tripId);

                // Check every stop update in the trip
                entity.tripUpdate.stopTimeUpdate.forEach((stopUpdate) => {
                    if (this._isRelevantStop(stopUpdate, entity, stopId, stopIdPatterns)) {
                        const arrivalTime = stopUpdate.arrival?.time || stopUpdate.departure?.time;

                        if (arrivalTime) {
                            const minutes = Math.round((arrivalTime - now) / 60);

                            if (minutes >= 0 && minutes < 60) {
                                const arrival = {
                                    route: targetRoute,
                                    minutes,
                                    arrivalTime: new Date(arrivalTime * 1000),
                                };

                                // Attach Occupancy if available
                                if (vehicleData) {
                                    arrival.occupancyStatus = vehicleData.occupancyStatus;
                                    arrival.occupancyPercentage = vehicleData.occupancyPercentage;
                                }

                                // Look ahead for Destination (Times Sq / Rockefeller)
                                const destInfo = this._calculateDestinationTime(
                                    entity.tripUpdate,
                                    targetRoute,
                                    minutes,
                                    now
                                );
                                if (destInfo) {
                                    arrival.destMinutes = destInfo.minutes;
                                    arrival.destLabel = destInfo.label;
                                }

                                arrivals.push(arrival);
                            }
                        }
                    }
                });
            }
        });

        return arrivals;
    }

    _isRelevantStop(stopUpdate, entity, simpleStopId, patterns) {
        const stopIdStr = stopUpdate.stopId || '';

        if (patterns) {
            const hasPattern = patterns.every((p) => stopIdStr.includes(p));
            // Ensure Northbound logic is respected
            const isNorthbound =
                stopIdStr.includes('N') ||
                stopIdStr.endsWith('N') ||
                entity.tripUpdate.trip?.directionId === 1;
            return hasPattern && isNorthbound;
        } else {
            return stopIdStr.includes(simpleStopId);
        }
    }

    _calculateDestinationTime(tripUpdate, routeId, currentMinutes, now) {
        const destConfig = DESTINATION_STOPS[routeId];
        if (!destConfig) return null;

        const destUpdate = tripUpdate.stopTimeUpdate.find(u => u.stopId === destConfig.stopId);
        if (destUpdate) {
            const destTime = destUpdate.arrival?.time || destUpdate.departure?.time;
            if (destTime) {
                const destMins = Math.round((destTime - now) / 60);
                if (destMins > currentMinutes) {
                    console.log(`[SubwayProcessor] ${routeId} Destination: ${destConfig.label} (${destMins}m)`);
                    return {
                        minutes: destMins,
                        label: destConfig.label
                    };
                }
            }
        }
        return null;
    }
}

module.exports = new SubwayProcessor();
