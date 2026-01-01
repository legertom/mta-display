# MTA Data Structure Notes

## Subway Occupancy Data

### What We're Getting
The MTA GTFS-RT feeds include `occupancyStatus` and `occupancyPercentage` fields in the `vehicle` entities, but:

1. **The data is always 0**: All subway trains show `occupancyStatus: 0` (EMPTY) and `occupancyPercentage: 0`
2. **This is not accurate**: The trains are not actually empty - the MTA simply doesn't populate this data
3. **Why**: Unlike buses (which have Automated Passenger Counter sensors), subways don't have occupancy sensors in the GTFS-RT feeds

### Data Structure
- **Vehicle entities** contain: `trip`, `currentStopSequence`, `currentStatus`, `timestamp`, `stopId`
- **Occupancy fields exist** but are always set to default values (0)
- **TripId matching works**: We can match vehicle positions to trip updates by `tripId`

### What This Means
- **Q trains**: Show `occupancyStatus: 0, occupancyPercentage: 0` - data exists but is unpopulated
- **2/5 trains**: May not have vehicle data matched, or also show 0 values
- **Display**: We hide occupancy data when it's 0/0 because it's not real data

## Bus Occupancy Data

### What We're Getting
Buses have real occupancy data via the Bus Time API (SIRI):

1. **SIRI Stop Monitoring API** provides:
   - `ExpectedArrivalTime` - real-time predicted arrival
   - `Extensions.Capacities.EstimatedPassengerCount` - current passenger count
   - `Extensions.Capacities.EstimatedPassengerCapacity` - total capacity
   - `Extensions.Capacities.EstimatedPassengerLoadFactor` - load factor string

2. **This data is accurate** because buses have APC sensors

### Data Structure
- **MonitoredStopVisit** contains `MonitoredVehicleJourney` with:
  - `MonitoredCall.Extensions.Capacities` - passenger data
  - `ExpectedArrivalTime` - predicted arrival
  - `Occupancy` - occupancy status string

## Recommendations

1. **For Subways**: Don't display occupancy data when it's 0/0 - it's not real data
2. **For Buses**: Display passenger count and percentage when available (it's accurate)
3. **Future**: MTA may add subway occupancy sensors, but currently they don't exist in GTFS-RT feeds

