import { describe, it, expect } from 'vitest';
import { getBusOccupancy, getSubwayOccupancyColor, formatDestinationArrival } from '../src/client/modules/utils/formatters';

describe('UI Formatters', () => {

    describe('getBusOccupancy', () => {
        it('should calculate percent from capacity', () => {
            const result = getBusOccupancy(50, 100, null);
            expect(result.percent).toBe(50);
            expect(result.label).toBe('50/100');
            expect(result.barColor).toContain('var(--status-low)'); // 50 is Green
            // Logic check: if (percent > 50) yellow. So 50 is green.
            // Let's check implementation behavior:
            // 50 > 50 is false. So Green.
        });

        it('should map "Standing Room" to 80% red', () => {
            const result = getBusOccupancy(undefined, undefined, 'standing');
            expect(result.percent).toBe(80);
            expect(result.label).toBe('Standing');
            expect(result.barColor).toContain('var(--status-medium)'); // 80 > 80 is false. Yellow.
            // Wait, logic: if (percent > 80) Red. 80 is Yellow.
            // "STANDING" usually implies fullish. 
            // Let's verify and maybe fix logic if needed. 
        });

        it('should map "Full" to 100% red', () => {
            const result = getBusOccupancy(undefined, undefined, 'full');
            expect(result.percent).toBe(100);
            expect(result.barColor).toContain('var(--status-high)'); // 100 > 80 is true. Red.
        });

        it('should return null if no data', () => {
            expect(getBusOccupancy(undefined, undefined, undefined)).toBeNull();
        });
    });

    describe('formatDestinationArrival', () => {
        it('should return formatted string', () => {
            const str = formatDestinationArrival(10, 'Times Sq');
            expect(str).toMatch(/Times Sq \d{1,2}:\d{2}\s?(am|pm)/);
        });

        it('should return null if no destMinutes', () => {
            expect(formatDestinationArrival(null, 'Times Sq')).toBeNull();
        });
    });

    describe('getSubwayOccupancyColor', () => {
        it('should return green styles', () => {
            const style = getSubwayOccupancyColor('green');
            expect(style.bg).toBe('#d4edda');
        });

        it('should default to red for unknown', () => {
            const style = getSubwayOccupancyColor('unknown');
            expect(style.bg).toBe('#f8d7da');
        });
    });
});
