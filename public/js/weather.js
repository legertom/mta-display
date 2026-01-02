/**
 * Weather Widget for MTA Display
 * Fetches current weather for Brooklyn (11226) from Open-Meteo
 */

class WeatherWidget {
    constructor() {
        this.container = document.getElementById('weatherWidget');
        this.iconEl = this.container.querySelector('.weather-icon');
        this.tempEl = this.container.querySelector('.weather-temp');
        this.feelsLikeEl = this.container.querySelector('.weather-feels-like');

        // Configuration
        this.apiUrl = 'https://api.open-meteo.com/v1/forecast?latitude=40.6466&longitude=-73.9569&current=temperature_2m,apparent_temperature,weather_code,is_day&temperature_unit=fahrenheit';
        this.refreshInterval = 15 * 60 * 1000; // 15 minutes

        // WMO Weather interpretation codes (http://www.wmo.int/pages/prog/www/IMOP/WMO306/306_Vol_I_1_CodeTable_4677_en.pdf)
        // Minimal Swiss-style SVG Icons with Color Accents
        const icons = {
            clearDay: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5" fill="#fccc0a" stroke="#fccc0a"/><line x1="12" y1="1" x2="12" y2="3" stroke="#fccc0a"/><line x1="12" y1="21" x2="12" y2="23" stroke="#fccc0a"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="#fccc0a"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="#fccc0a"/><line x1="1" y1="12" x2="3" y2="12" stroke="#fccc0a"/><line x1="21" y1="12" x2="23" y2="12" stroke="#fccc0a"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="#fccc0a"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="#fccc0a"/></svg>',
            clearNight: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#fccc0a" stroke="#fccc0a"/></svg>',
            cloudy: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="#e6e6e6" stroke="#e6e6e6"/></svg>',
            partlyCloudyDay: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="5" r="2" fill="#fccc0a" stroke="#fccc0a"/><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="#e6e6e6" stroke="#e6e6e6"/></svg>',
            rain: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="#e6e6e6" stroke="#e6e6e6"/><line x1="8" y1="23" x2="8" y2="23" stroke="#0039a6" stroke-width="3"/><line x1="12" y1="23" x2="12" y2="23" stroke="#0039a6" stroke-width="3"/><line x1="16" y1="23" x2="16" y2="23" stroke="#0039a6" stroke-width="3"/></svg>',
            snow: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" fill="#e6e6e6" stroke="#e6e6e6"/><line x1="8" y1="16" x2="8.01" y2="16" stroke="#ffffff"/><line x1="8" y1="20" x2="8.01" y2="20" stroke="#ffffff"/><line x1="12" y1="18" x2="12.01" y2="18" stroke="#ffffff"/><line x1="12" y1="22" x2="12.01" y2="22" stroke="#ffffff"/><line x1="16" y1="16" x2="16.01" y2="16" stroke="#ffffff"/><line x1="16" y1="20" x2="16.01" y2="20" stroke="#ffffff"/></svg>',
            storm: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="#4a4a4a" stroke="#4a4a4a"/><polygon points="13 23 11 17 15 17 13 23" fill="#fccc0a" stroke="#fccc0a"/></svg>',
            fog: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" stroke="#888888"/><path d="M5 16h14" stroke="#888888"/><path d="M5 8h14" stroke="#888888"/></svg>'
        };

        this.weatherCodes = {
            0: { day: icons.clearDay, night: icons.clearNight, label: 'Clear' },
            1: { day: icons.partlyCloudyDay, night: icons.cloudy, label: 'Mainly Clear' },
            2: { day: icons.partlyCloudyDay, night: icons.cloudy, label: 'Partly Cloudy' },
            3: { day: icons.cloudy, night: icons.cloudy, label: 'Overcast' },
            45: { day: icons.fog, night: icons.fog, label: 'Fog' },
            48: { day: icons.fog, night: icons.fog, label: 'Depositing Rime Fog' },
            51: { day: icons.rain, night: icons.rain, label: 'Light Drizzle' },
            53: { day: icons.rain, night: icons.rain, label: 'Moderate Drizzle' },
            55: { day: icons.rain, night: icons.rain, label: 'Dense Drizzle' },
            61: { day: icons.rain, night: icons.rain, label: 'Slight Rain' },
            63: { day: icons.rain, night: icons.rain, label: 'Moderate Rain' },
            65: { day: icons.rain, night: icons.rain, label: 'Heavy Rain' },
            71: { day: icons.snow, night: icons.snow, label: 'Slight Snow' },
            73: { day: icons.snow, night: icons.snow, label: 'Moderate Snow' },
            75: { day: icons.snow, night: icons.snow, label: 'Heavy Snow' },
            77: { day: icons.snow, night: icons.snow, label: 'Snow Grains' },
            80: { day: icons.rain, night: icons.rain, label: 'Slight Showers' },
            81: { day: icons.rain, night: icons.rain, label: 'Moderate Showers' },
            82: { day: icons.rain, night: icons.rain, label: 'Violent Showers' },
            95: { day: icons.storm, night: icons.storm, label: 'Thunderstrom' },
            96: { day: icons.storm, night: icons.storm, label: 'Thunderstorm with Hail' },
            99: { day: icons.storm, night: icons.storm, label: 'Thunderstorm with Heavy Hail' }
        };

        this.init();
    }

    async init() {
        await this.fetchWeather();
        setInterval(() => this.fetchWeather(), this.refreshInterval);
    }

    async fetchWeather() {
        try {
            const response = await fetch(this.apiUrl);
            if (!response.ok) throw new Error('Weather fetch failed');

            const data = await response.json();
            this.updateUI(data.current);
        } catch (error) {
            console.error('Weather widget error:', error);
            // On error, just hide or show mostly empty state, maybe a neutral icon
            this.iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>';
            this.tempEl.textContent = '--°';
        }
    }

    updateUI(current) {
        if (!current) return;

        const isDay = current.is_day === 1;
        const code = current.weather_code;
        const info = this.weatherCodes[code] || this.weatherCodes[0];
        const icon = isDay ? info.day : info.night;

        this.iconEl.innerHTML = icon;
        this.iconEl.title = info.label;
        this.tempEl.textContent = `${Math.round(current.temperature_2m)}°`;
        this.feelsLikeEl.textContent = `${Math.round(current.apparent_temperature)}°`;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new WeatherWidget();
});
