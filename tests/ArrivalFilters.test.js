import { describe, it, expect } from 'vitest';
import filters from '../src/server/services/rules/ArrivalFilters';

describe('ArrivalFilters', () => {

    describe('sortAndFilter', () => {
        it('should sort by minutes', () => {
            const arrivals = [
                { minutes: 10, route: 'B' },
                { minutes: 5, route: 'Q' },
            ];
            const result = filters.sortAndFilter(arrivals);
            expect(result[0].minutes).toBe(5);
            expect(result[1].minutes).toBe(10);
        });

        it('should filter out > 30 mins', () => {
            const arrivals = [
                { minutes: 2, route: 'A' },
                { minutes: 31, route: 'B' }
            ];
            const result = filters.sortAndFilter(arrivals, 30);
            expect(result).toHaveLength(1);
            expect(result[0].route).toBe('A');
        });
    });

    describe('processB41 (Business Rules)', () => {
        it('should filter Clarkson stop to ONLY show Limited buses and remove duplicates', () => {
            // Mock Data
            const catonBus = {
                route: 'B41',
                minutes: 4,
                isLimited: false,
                headsign: 'Downtown Bklyn',
                tripId: 'TRIP_123',
                location: 'Caton Ave'
            };

            const clarksonDuplicate = {
                route: 'B41',
                minutes: 6,
                isLimited: false,
                headsign: 'Downtown Bklyn',
                tripId: 'TRIP_123', // Same Trip ID as Caton
                location: 'Clarkson Ave'
            };

            const clarksonLimited = {
                route: 'B41',
                minutes: 9,
                isLimited: true,
                headsign: 'Downtown Bklyn LTD',
                tripId: 'TRIP_LTD_1',
                location: 'Clarkson Ave'
            };

            const clarksonLocal = {
                route: 'B41',
                minutes: 17,
                isLimited: false,
                headsign: 'Downtown Bklyn',
                tripId: 'TRIP_LOCAL_2',
                location: 'Clarkson Ave'
            };

            const b41Caton = [catonBus];
            const b41Clarkson = [clarksonDuplicate, clarksonLimited, clarksonLocal];

            // Act
            const result = filters.processB41(b41Caton, b41Clarkson);

            // Assert

            // 1. Caton Bus should be present
            const foundCaton = result.find(b => b.tripId === 'TRIP_123');
            expect(foundCaton).toBeDefined();
            expect(foundCaton.location).toBe('Caton Ave'); // Should prefer Caton instance

            // 2. Clarkson Local (TRIP_LOCAL_2) should be filtered out (Clarkson = Limited Only)
            const foundClarksonLocal = result.find(b => b.tripId === 'TRIP_LOCAL_2');
            expect(foundClarksonLocal).toBeUndefined();

            // 3. Clarkson Limited (TRIP_LTD_1) should be present
            const foundClarksonLimited = result.find(b => b.tripId === 'TRIP_LTD_1');
            expect(foundClarksonLimited).toBeDefined();
            expect(foundClarksonLimited.location).toBe('Clarkson Ave');
        });
    });

    describe('filterByDirection', () => {
        it('should filter by headsign text', () => {
            const arrivals = [
                { headsign: 'To Fulton' },
                { headsign: 'To Somewhere Else' }
            ];
            const result = filters.filterByDirection(arrivals, 'Fulton');
            expect(result).toHaveLength(1);
            expect(result[0].headsign).toBe('To Fulton');
        });
    });
});
