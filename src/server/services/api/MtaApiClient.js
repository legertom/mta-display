const axios = require('axios');

/**
 * Low-level client for fetching data from MTA APIs.
 * Handles HTTP specifics like timeouts, buffer types, and error logging.
 */
class MtaApiClient {
    constructor() {
        this.client = axios.create({
            timeout: 10000,
        });
    }

    /**
     * Fetch GTFS Realtime Feed (Protocol Buffers)
     * @param {string} url 
     * @returns {Promise<Buffer|null>} Buffer or null if failed
     */
    async fetchGtfs(url) {
        try {
            const response = await this.client.get(url, {
                responseType: 'arraybuffer',
            });
            return response.data;
        } catch (error) {
            console.error(`[MtaApiClient] GTFS Fetch Error (${url}):`, error.message);
            return null;
        }
    }

    /**
     * Fetch SIRI JSON Feed (Bus Time)
     * @param {string} url 
     * @param {Object} params - Query parameters (key, LineRef, etc.)
     * @returns {Promise<Object|null>} JSON data or null if failed
     */
    async fetchSiri(url, params) {
        try {
            const response = await this.client.get(url, { params });
            return response.data;
        } catch (error) {
            console.error(`[MtaApiClient] SIRI Fetch Error (${url}):`, error.message);
            return null;
        }
    }
}

module.exports = new MtaApiClient();
