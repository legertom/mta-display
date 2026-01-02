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


}

export const renderer = new Renderer();
