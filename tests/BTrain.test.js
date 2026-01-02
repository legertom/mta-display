
import { describe, it, expect } from 'vitest';
import SubwayProcessor from '../src/server/services/logic/SubwayProcessor';
import { DESTINATION_STOPS } from '../src/server/config/constants';

describe('B Train Destination Logic', () => {

    it('should have B train configuration', () => {
        expect(DESTINATION_STOPS['B']).toBeDefined();
        expect(DESTINATION_STOPS['B'].stopId).toBe('D15N');
        expect(DESTINATION_STOPS['B'].label).toBe('Rockefeller Ctr');
    });

    it('should calculate destination time correctly for B train', () => {
        const now = Math.floor(Date.now() / 1000);
        // Mock TripUpdate
        const tripUpdate = {
            trip: { routeId: 'B' },
            stopTimeUpdate: [
                {
                    stopId: 'D15N', // Rockefeller
                    arrival: { time: now + 600 } // 10 mins away
                }
            ]
        };

        const result = SubwayProcessor._calculateDestinationTime(tripUpdate, 'B', 5, now);

        expect(result).not.toBeNull();
        expect(result.minutes).toBe(10);
        expect(result.label).toBe('Rockefeller Ctr');
    });

    it('should return null if destination is in the past or before current position', () => {
        const now = Math.floor(Date.now() / 1000);
        // Mock TripUpdate
        const tripUpdate = {
            trip: { routeId: 'B' },
            stopTimeUpdate: [
                {
                    stopId: 'D15N',
                    arrival: { time: now + 120 } // 2 mins away
                }
            ]
        };

        // If current position is 5 mins away, passing destination (2 mins) makes no sense physically unless passed, 
        // but _calculateDestinationTime checks: if (destMins > currentMinutes)

        const result = SubwayProcessor._calculateDestinationTime(tripUpdate, 'B', 5, now);
        expect(result).toBeNull();
    });
});
