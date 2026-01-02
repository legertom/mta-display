export class MtaClient {
    constructor(baseUrl = '/api') {
        this.baseUrl = baseUrl;
    }

    async fetchArrivals() {
        try {
            const response = await fetch(`${this.baseUrl}/arrivals`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }
}

export const api = new MtaClient();
