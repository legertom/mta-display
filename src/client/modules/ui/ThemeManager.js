const THEME_CHECK_INTERVAL = 60000; // Check theme every minute

export const ThemeManager = {
    init() {
        this.update();
        setInterval(() => this.update(), THEME_CHECK_INTERVAL);
    },

    update() {
        const hour = new Date().getHours();
        const isDay = hour >= 7 && hour < 20; // 7am to 8pm

        if (isDay) {
            document.documentElement.classList.add('light-mode');
        } else {
            document.documentElement.classList.remove('light-mode');
        }
    }
};
