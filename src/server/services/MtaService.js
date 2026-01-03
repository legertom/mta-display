const env = require('../config/env');
const { FEEDS, STOPS, ROUTES } = require('../config/constants');
const apiClient = require('./api/MtaApiClient');
const subwayProcessor = require('./logic/SubwayProcessor');
const busProcessor = require('./logic/BusProcessor');
const filters = require('./rules/ArrivalFilters');

/**
 * Service for interacting with MTA APIs.
 * Orchestrates fetching, parsing, and filtering of transit data.
 */
class MtaService {

    /**
     * Fetch all arrival data
     * @returns {Promise<{subway: Object, buses: Object, timestamp: string}>}
     */
    async getAllArrivals() {
        // Parallel fetch for speed
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
        // Fetch raw buffers
        const [bBuf, qBuf, irBuf] = await Promise.all([
            apiClient.fetchGtfs(FEEDS.B_TRAIN),
            apiClient.fetchGtfs(FEEDS.Q_TRAIN),
            apiClient.fetchGtfs(FEEDS.IRT),
        ]);

        // Process Feeds
        // Note: 2 and 5 are on the same IRT feed
        const churchAve = [
            ...subwayProcessor.parse(bBuf, 'B', STOPS.SUBWAY.CHURCH_AVE, ['D28', 'N']),
            ...subwayProcessor.parse(qBuf, 'Q', STOPS.SUBWAY.CHURCH_AVE, ['D28', 'N']),
        ];

        const winthropSt = [
            ...subwayProcessor.parse(irBuf, '2', STOPS.SUBWAY.WINTHROP_ST, ['241', 'N']),
            ...subwayProcessor.parse(irBuf, '5', STOPS.SUBWAY.WINTHROP_ST, ['241', 'N']),
        ];

        return {
            churchAve: filters.sortAndFilter(churchAve).map(a => ({ ...a, station: 'Church Ave' })),
            winthrop: filters.sortAndFilter(winthropSt).map(a => ({ ...a, station: 'Winthrop St' })),
        };
    }

    /* -------------------------------------------------------------------------- */
    /*                                 BUS LOGIC                                  */
    /* -------------------------------------------------------------------------- */

    async getBusArrivals() {
        if (!env.BUS_TIME_API_KEY) return { b41: [], b44Sbs: [], b49: [] };

        const [b41Caton, b41Clarkson, b44Sbs, b49] = await Promise.all([
            this._fetchAndProcessBus('B41', STOPS.BUS.B41_CATON),
            this._fetchAndProcessBus('B41', STOPS.BUS.B41_CLARKSON),
            this._fetchAndProcessBus('B44-SBS', STOPS.BUS.B44_SBS_ROGERS_CLARKSON),
            this._fetchAndProcessBus('B49', STOPS.BUS.B49_ROGERS_LENOX),
        ]);

        // Apply Business Rules
        const b41Final = filters.processB41(b41Caton, b41Clarkson);

        // Filter B49 for 'Fulton' direction/headsign
        const b49Final = filters.filterByDirection(b49, 'Fulton');

        return {
            b41: b41Final,
            b44Sbs: filters.sortAndFilter(b44Sbs.map(a => ({ ...a, location: 'Rogers/Clarkson' }))),
            b49: filters.sortAndFilter(b49Final.map(a => ({ ...a, location: 'Rogers/Lenox' }))),
        };
    }

    /**
     * Helper to Fetch -> Parse -> Hydrate a single bus route/stop
     */
    async _fetchAndProcessBus(routeId, stopId) {
        const url = `${FEEDS.BUS_SIRI_URL}/stop-monitoring.json`;

        // SBS routes use + suffix in API (e.g., B44-SBS -> B44+)
        const apiRouteId = routeId.endsWith('-SBS')
            ? routeId.replace('-SBS', '+')
            : routeId;

        const params = {
            key: env.BUS_TIME_API_KEY,
            MonitoringRef: stopId,
            LineRef: `MTA NYCT_${apiRouteId}`,
        };

        // 1. Fetch
        const json = await apiClient.fetchSiri(url, params);

        // 2. Parse (SIRI -> Objects + VehicleMap)
        const { arrivals, vehicleMap } = busProcessor.parseSiri(json, routeId);

        // 3. Hydrate (Objects + VehicleMap -> Objects with Occupancy)
        return busProcessor.hydrate(arrivals, vehicleMap);
    }
}

module.exports = new MtaService();
