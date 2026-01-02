const axios = require('axios');
const gtfs = require('gtfs-realtime-bindings');
const env = require('../config/env');
const { FEEDS, STOPS } = require('../config/constants');

// Map route to the "City" destination stop we care about for 'Times Square' lookup
const DESTINATION_STOPS = {
    'Q': 'R16N', // Times Sq - 42 St
    'N': 'R16N',
    '2': '127N', // Times Sq - 42 St
    '3': '127N',
    '5': '127N'  // (Late nights/Weekends often shares track)
};

/**
 * Service for interacting with MTA APIs
 */
class MtaService {
    constructor() {
        this.axios = axios.create({
            timeout: 10000,
        });
    }

    /**
     * Fetch all arrival data
     * @returns {Promise<{subway: Object, buses: Object, timestamp: string}>}
     */
    async getAllArrivals() {
        const [subway, buses] = await Promise.all([
            this.getSubwayArrivals(),
            this.getBusArrivals(),
        ]);

        return {
            subway,
            buses,
            timestamp: new Date().toISOString(),
        };
    }

    /* -------------------------------------------------------------------------- */
    /*                                SUBWAY LOGIC                                */
    /* -------------------------------------------------------------------------- */

    async getSubwayArrivals() {
        const churchAveArrivals = [];
        const winthropArrivals = [];

        const [bTrain, qTrain, train2, train5] = await Promise.all([
            this._fetchSubwayFeed(FEEDS.B_TRAIN, 'B', STOPS.SUBWAY.CHURCH_AVE, ['D28', 'N']),
            this._fetchSubwayFeed(FEEDS.Q_TRAIN, 'Q', STOPS.SUBWAY.CHURCH_AVE, ['D28', 'N']),
            this._fetchSubwayFeed(FEEDS.IRT, '2', STOPS.SUBWAY.WINTHROP_ST, ['241', 'N']),
            this._fetchSubwayFeed(FEEDS.IRT, '5', STOPS.SUBWAY.WINTHROP_ST, ['241', 'N']),
        ]);

        churchAveArrivals.push(...bTrain, ...qTrain);
        winthropArrivals.push(...train2, ...train5);

        return {
            churchAve: this._sortAndFilter(churchAveArrivals, 60).map(a => ({ ...a, station: 'Church Ave' })),
            winthrop: this._sortAndFilter(winthropArrivals, 60).map(a => ({ ...a, station: 'Winthrop St' })),
        };
    }

    async _fetchSubwayFeed(feedUrl, targetRoute, stopId, stopIdPattern) {
        try {
            const response = await this.axios.get(feedUrl, {
                responseType: 'arraybuffer',
            });

            const feed = gtfs.transit_realtime.FeedMessage.decode(response.data);
            const arrivals = [];

            // Pass 1: Collect Vehicle Positions (Occupancy)
            const vehiclePositions = new Map();
            feed.entity.forEach((entity) => {
                if (
                    entity.vehicle &&
                    entity.vehicle.trip &&
                    entity.vehicle.trip.routeId === targetRoute
                ) {
                    const tripId = entity.vehicle.trip.tripId;
                    const occupancyStatus = entity.vehicle.occupancyStatus;
                    // Even if empty (0), store it
                    vehiclePositions.set(tripId, {
                        occupancyStatus,
                        occupancyPercentage: entity.vehicle.occupancyPercentage,
                    });
                }
            });

            // Pass 2: Process Trip Updates
            feed.entity.forEach((entity) => {
                if (
                    entity.tripUpdate &&
                    entity.tripUpdate.stopTimeUpdate &&
                    entity.tripUpdate.trip.routeId === targetRoute
                ) {
                    const tripId = entity.tripUpdate.trip.tripId;
                    const vehicleData = vehiclePositions.get(tripId);

                    entity.tripUpdate.stopTimeUpdate.forEach((stopUpdate) => {
                        const stopIdStr = stopUpdate.stopId || '';
                        let matchesStop = false;

                        if (stopIdPattern) {
                            const hasPattern = stopIdPattern.every((p) => stopIdStr.includes(p));
                            const isNorthbound =
                                stopIdStr.includes('N') ||
                                stopIdStr.endsWith('N') ||
                                entity.tripUpdate.trip?.directionId === 1;
                            matchesStop = hasPattern && isNorthbound;
                        } else {
                            // Fallback logic
                            matchesStop = stopIdStr.includes(stopId);
                        }

                        if (matchesStop) {
                            const arrivalTime = stopUpdate.arrival?.time || stopUpdate.departure?.time;
                            if (arrivalTime) {
                                const now = Math.floor(Date.now() / 1000);
                                const minutes = Math.round((arrivalTime - now) / 60);

                                if (minutes >= 0 && minutes < 60) {
                                    const arrival = {
                                        route: targetRoute,
                                        minutes,
                                        arrivalTime: new Date(arrivalTime * 1000),
                                    };

                                    if (vehicleData) {
                                        arrival.occupancyStatus = vehicleData.occupancyStatus;
                                        arrival.occupancyPercentage = vehicleData.occupancyPercentage;
                                    }

                                    // Look ahead for Destination (Times Sq) arrival
                                    const destStopId = DESTINATION_STOPS[targetRoute];
                                    if (destStopId) {
                                        const destUpdate = entity.tripUpdate.stopTimeUpdate.find(u => u.stopId === destStopId);
                                        if (destUpdate) {
                                            const destTime = destUpdate.arrival?.time || destUpdate.departure?.time;
                                            if (destTime) {
                                                const destMins = Math.round((destTime - now) / 60);
                                                if (destMins > minutes) {
                                                    arrival.destMinutes = destMins;
                                                }
                                            }
                                        }
                                    }

                                    arrivals.push(arrival);
                                }
                            }
                        }
                    });
                }
            });

            return arrivals;
        } catch (error) {
            console.error(`Error fetching subway feed ${targetRoute}:`, error.message);
            return [];
        }
    }

    /* -------------------------------------------------------------------------- */
    /*                                 BUS LOGIC                                  */
    /* -------------------------------------------------------------------------- */

    async getBusArrivals() {
        const [b41Caton, b41Clarkson, b49] = await Promise.all([
            this._fetchBusData('B41', STOPS.BUS.B41_CATON),
            this._fetchBusData('B41', STOPS.BUS.B41_CLARKSON),
            this._fetchBusData('B49', STOPS.BUS.B49_ROGERS_LENOX, 'Fulton'),
        ]);

        const b41Combined = [
            ...b41Caton.map((a) => ({ ...a, location: 'Caton Ave' })),
            ...b41Clarkson.map((a) => ({ ...a, location: 'Clarkson Ave' })),
        ];

        return {
            b41: this._sortAndFilter(b41Combined),
            b49: b49, // B49 is already filtered inside _fetchBusData
        };
    }

    async _fetchBusData(routeId, stopId, directionFilter = null) {
        if (!env.BUS_TIME_API_KEY) return [];

        try {
            // 1. Try SIRI (Realtime)
            const siriData = await this._fetchBusDataSIRI(routeId, stopId);

            if (siriData.arrivals.length > 0) {
                // Hydrate with vehicle data
                const hydrated = siriData.arrivals.map((arrival) => {
                    if (arrival.tripId && siriData.vehicleMap.has(arrival.tripId)) {
                        const vData = siriData.vehicleMap.get(arrival.tripId);
                        return { ...arrival, ...vData };
                    }
                    return arrival;
                });

                if (directionFilter) {
                    return hydrated.filter((a) => {
                        const headsign = (a.headsign || '').toLowerCase();
                        const filter = directionFilter.toLowerCase();
                        return (
                            headsign.includes(filter) ||
                            headsign.includes('bed stuy') ||
                            headsign.includes('bed-stuy')
                        );
                    });
                }
                return hydrated;
            }

            // 2. Fallback to Arrivals (Scheduled + Live) is omitted for simplicity in V2
            // The architecture favors reliability. If SIRI fails and user wants fallback code,
            // we can add it. For now, we stick to SIRI as primary.
            return [];
        } catch (error) {
            console.warn(`Bus fetch failed for ${routeId}:`, error.message);
            return [];
        }
    }

    async _fetchBusDataSIRI(routeId, stopId) {
        try {
            const url = `${FEEDS.BUS_SIRI_URL}/stop-monitoring.json`;
            const response = await this.axios.get(url, {
                params: {
                    key: env.BUS_TIME_API_KEY,
                    MonitoringRef: stopId,
                    LineRef: `MTA NYCT_${routeId}`,
                },
            });

            const arrivals = [];
            const vehicleMap = new Map();

            const deliveries =
                response.data?.Siri?.ServiceDelivery?.StopMonitoringDelivery || [];

            deliveries.forEach((delivery) => {
                const visits = delivery.MonitoredStopVisit || [];
                visits.forEach((visit) => {
                    const journey = visit.MonitoredVehicleJourney;
                    const call = journey?.MonitoredCall;

                    if (!journey || !call) return;

                    const arrivalTime = call.ExpectedArrivalTime || call.AimedArrivalTime;
                    if (!arrivalTime) return;

                    const minutes = Math.round((new Date(arrivalTime) - Date.now()) / 60000);

                    if (minutes >= -2 && minutes < 120) {
                        const tripId = journey.FramedVehicleJourneyRef?.DatedVehicleJourneyRef;
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
        } catch (error) {
            console.warn(`SIRI error ${routeId}:`, error.message);
            return { arrivals: [], vehicleMap: new Map() };
        }
    }

    _sortAndFilter(arrivals, maxMinutes = 30) {
        return arrivals.sort((a, b) => a.minutes - b.minutes).filter((a) => a.minutes <= maxMinutes);
    }
}

module.exports = new MtaService();
