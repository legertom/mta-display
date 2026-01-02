import { appStore } from '../state/Store.js';

export const FilterManager = {
    init() {
        // Attach click listeners to all filter badges
        document.querySelectorAll('.filter-badge').forEach(badge => {
            badge.addEventListener('click', (e) => {
                const target = e.currentTarget; // Use currentTarget to get the button, not inner span
                const route = target.dataset.route;
                const isBus = target.classList.contains('bus');

                this.toggleFilter(isBus ? 'bus' : 'subway', route);
            });
        });

        // Subscribe to store updates to keep UI in sync
        appStore.subscribe((state) => {
            this.updateUI(state.filters);
        });
    },

    toggleFilter(type, route) {
        const currentFilters = appStore.getState().filters;
        const list = currentFilters[type];
        let newList;

        if (list.includes(route)) {
            // Remove
            newList = list.filter(r => r !== route);
        } else {
            // Add
            newList = [...list, route];
        }

        // Update state
        appStore.setState({
            filters: {
                ...currentFilters,
                [type]: newList
            }
        });
    },

    updateUI(filters) {
        document.querySelectorAll('.filter-badge').forEach(badge => {
            const route = badge.dataset.route;
            const isBus = badge.classList.contains('bus');
            const list = isBus ? filters.bus : filters.subway;

            if (list.includes(route)) {
                badge.classList.add('active');
            } else {
                badge.classList.remove('active');
            }
        });
    }
};
