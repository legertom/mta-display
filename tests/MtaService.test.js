import { describe, it, expect, vi } from 'vitest';
import mtaService from '../src/server/services/MtaService';

// Mock Dependencies
vi.mock('axios', () => ({
    default: {
        create: () => ({
            get: vi.fn(),
        }),
    },
}));

// Mock Constants (since we are not actually running valid GTFS decoders in this simple test)
// For a real "Gold Standard" we'd use a real GTFS sample buffer. 
// For this verifying step, we will test the structure of the service.

describe('MtaService', () => {
    it('should be a singleton instance', () => {
        expect(mtaService).toBeDefined();
        expect(mtaService.getAllArrivals).toBeInstanceOf(Function);
    });

    it('should have sortAndFilter method', () => {
        const arrivals = [
            { minutes: 45, route: 'Q' },
            { minutes: 5, route: 'B' },
            { minutes: 100, route: 'Q' }, // Should be filtered
        ];

        // access private method for testing (javascript allows it)
        const result = mtaService._sortAndFilter(arrivals);

        expect(result).toHaveLength(1);
        expect(result[0].minutes).toBe(5);
        // 100 should be filtered out (>30? wait, logic said <=30 in MtaService.js)
        // Let's check MtaService logic again.
        // Logic: filter(a => a.minutes <= 30)
        // So 45 should also be filtered!
    });

    it('should filter out > 30 mins', () => {
        const arrivals = [
            { minutes: 2, route: 'A' },
            { minutes: 31, route: 'B' }
        ];
        const result = mtaService._sortAndFilter(arrivals);
        expect(result).toHaveLength(1);
        expect(result[0].route).toBe('A');
    });
});
