/**
 * Simple Pub/Sub State Manager
 */
export class Store {
    constructor(initialState = {}) {
        this.state = initialState;
        this.listeners = new Set();
    }

    /**
     * Get current state
     */
    getState() {
        return this.state;
    }

    /**
     * Update state and notify listeners
     * @param {Object} partialState 
     */
    setState(partialState) {
        this.state = { ...this.state, ...partialState };
        this.notify();
    }

    /**
     * Subscribe to changes
     * @param {Function} listener 
     * @returns {Function} unsubscribe
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
}

export const appStore = new Store({
    subway: { churchAve: [], winthrop: [] },
    buses: { b41: [], b49: [] },
    loading: true,
    lastUpdated: null,
    filters: {
        subway: ['B', 'Q', '2', '5'],
        bus: ['B41', 'B49']
    },
    errors: []
});
