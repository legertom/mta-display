import { appStore } from '../state/Store.js';
import { ArrivalCard } from './ArrivalCard.js';

export class Renderer {
    constructor() {
        this.subwayContainer = document.getElementById('subwayArrivals');
        this.busContainer = document.getElementById('busArrivals');
        this.lastUpdatedEl = document.getElementById('lastUpdated');

        // Bind Methods
        this.render = this.render.bind(this);
    }

    init() {
        // Initial Render
        this.render(appStore.getState());

        // Subscribe to updates
        appStore.subscribe(this.render);

        // Bind Interactions (Filter Toggles)
        this.bindEvents();
    }

    bindEvents() {
        // Filter Toggles
        document.querySelectorAll('.filter-badge').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const route = e.target.dataset.route;
                const type = e.target.classList.contains('bus-filter') ? 'bus' : 'subway';
                this.toggleFilter(type, route);
            });
        });

        // Optional: Manual refresh via keyboard (for debugging)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                window.dispatchEvent(new Event('mta-refresh'));
            }
        });
    }

    toggleFilter(type, route) {
        const currentFilters = appStore.getState().filters[type];
        let newFilters;

        if (currentFilters.includes(route)) {
            if (currentFilters.length > 1) {
                newFilters = currentFilters.filter(r => r !== route);
            } else {
                return; // Don't remove last one
            }
        } else {
            newFilters = [...currentFilters, route];
        }

        appStore.setState({
            filters: {
                ...appStore.getState().filters,
                [type]: newFilters
            }
        });
    }

    render(state) {
        // Note: lastUpdated is now managed by main.js countdown timer

        // Global Error Display - only show if actual errors
        if (state.errors && state.errors.length > 0) {
            this.lastUpdatedEl.textContent = `Error: ${state.errors[0]}`;
            this.lastUpdatedEl.classList.add('error');
            console.error('App Errors:', state.errors);
        } else {
            this.lastUpdatedEl.classList.remove('error');
        }

        // 2. Render Subway
        this.renderList(
            this.subwayContainer,
            state.subway,
            state.filters.subway,
            'No trains arriving'
        );

        // 3. Render Bus
        this.renderList(
            this.busContainer,
            state.buses,
            state.filters.bus,
            'No buses arriving'
        );

        // 4. Update Filter Badges UI
        this.updateBadges(state.filters);
    }

    renderList(container, dataGroup, activeFilters, emptyMsg) {
        // Flatten and Filter
        const allItems = Object.values(dataGroup).flat();
        const filtered = allItems
            .filter(item => activeFilters.includes(item.route || item.busRoute))
            .sort((a, b) => a.minutes - b.minutes);

        let newHtml;
        if (filtered.length === 0) {
            newHtml = `<div class="no-arrivals">${emptyMsg}</div>`;
        } else {
            newHtml = filtered.map(item => ArrivalCard(item)).join('');
        }

        // Only update DOM if content has changed (prevents blinking)
        if (container.innerHTML !== newHtml) {
            container.innerHTML = newHtml;
        }
    }

    updateBadges(filters) {
        document.querySelectorAll('.filter-badge').forEach(btn => {
            const route = btn.dataset.route;
            const type = btn.classList.contains('bus-filter') ? 'bus' : 'subway';
            if (filters[type].includes(route)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

export const renderer = new Renderer();
