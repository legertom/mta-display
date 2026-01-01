const express = require('express');
const cors = require('cors');
const axios = require('axios');
const gtfs = require('gtfs-realtime-bindings');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MTA API Configuration
// Note: Subway feeds don't require an API key, but Bus Time API does
const BUS_TIME_API_KEY = process.env.BUS_TIME_API_KEY || '';

// Subway feed URLs
// B and Q trains are on different feeds:
// - B train: BDFM feed
// - Q train: NQRW feed
// - 2 and 5 trains: 1234567S feed
const B_TRAIN_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm';
const Q_TRAIN_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw';
const IRT_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs';

// Bus Time API base URL
const BUS_TIME_BASE_URL = 'https://bustime.mta.info/api/where';

// Stop IDs (these may need to be verified/updated)
// Church Ave stop for B/Q trains (Manhattan-bound)
const CHURCH_AVE_STOP_ID = 'D28N'; // Northbound (Manhattan-bound) at Church Ave
// Winthrop St stop for 2/5 trains (Manhattan-bound)
// MTA GTFS stop ID for Winthrop St northbound platform
const WINTHROP_STOP_ID = '241N'; // Northbound (Manhattan-bound) at Winthrop St

// Bus stop IDs
// B41 stops on Flatbush Avenue
const B41_CATON_AVE_STOP = 'MTA_303241'; // FLATBUSH AV/CATON AV (try MTA_303308 if this doesn't work for Downtown direction)
const B41_CLARKSON_AVE_STOP = 'MTA_303242'; // FLATBUSH AV/CLARKSON AV
// B49 stop
const B49_ROGERS_LENOX_STOP = 'MTA_303944'; // ROGERS AV/LENOX RD

// Helper function to fetch subway data from a specific feed
async function fetchSubwayFeed(feedUrl, targetRoute, stopId, stopIdPattern) {
  const arrivals = [];
  const vehiclePositions = new Map(); // Map trip IDs to vehicle positions for occupancy data
  
  try {
    // No API key needed for these public feeds
    const response = await axios.get(feedUrl, {
      responseType: 'arraybuffer'
    });

    const feed = gtfs.transit_realtime.FeedMessage.decode(response.data);

    // First pass: collect vehicle positions with occupancy data
    // Note: MTA GTFS-RT feeds include occupancyStatus field, but it's always 0 (empty)
    // This appears to be because MTA doesn't populate occupancy data for subways in GTFS-RT
    // (unlike buses which have APC sensors and provide occupancy via Bus Time API)
    for (const entity of feed.entity) {
      if (entity.vehicle && entity.vehicle.trip && entity.vehicle.trip.routeId === targetRoute) {
        const tripId = entity.vehicle.trip.tripId;
        // Store occupancy data even if it's 0, so we know the field exists
        // occupancyStatus: 0 means EMPTY in GTFS-RT spec
        if (tripId && 'occupancyStatus' in entity.vehicle) {
          vehiclePositions.set(tripId, {
            occupancyStatus: entity.vehicle.occupancyStatus,
            occupancyPercentage: entity.vehicle.occupancyPercentage
          });
        }
      }
    }

    // Second pass: process trip updates and match with vehicle positions
    for (const entity of feed.entity) {
      if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
        const routeId = entity.tripUpdate.trip.routeId;
        const tripId = entity.tripUpdate.trip.tripId;
        
        if (routeId === targetRoute) {
          // Get occupancy data for this trip if available
          const vehicleData = vehiclePositions.get(tripId);
          
          for (const stopUpdate of entity.tripUpdate.stopTimeUpdate) {
            // Check if this stop matches the target stop (Manhattan-bound)
            const stopIdStr = stopUpdate.stopId || '';
            let matchesStop = false;
            
            // Debug: log stop IDs for route 2/5 to find Winthrop
            if ((targetRoute === '2' || targetRoute === '5') && stopIdStr) {
              // Only log first few to avoid spam
              if (arrivals.length === 0 && entity.id && entity.id.includes('00000')) {
                console.log(`Route ${targetRoute} stop ID: ${stopIdStr}`);
              }
            }
            
            if (stopIdPattern) {
              // Use pattern matching (e.g., for D28N, check for D28 and N)
              // For IRT lines (235), check for 235 and ensure it's northbound (N suffix or direction)
              const hasPattern = stopIdPattern.every(pattern => stopIdStr.includes(pattern));
              // For Winthrop (235), also check if it's northbound (Manhattan-bound)
              // Northbound stops typically have 'N' suffix or the trip direction indicates north
              const isNorthbound = stopIdStr.includes('N') || 
                                 stopIdStr.endsWith('N') ||
                                 (entity.tripUpdate.trip?.directionId === 1); // 1 = northbound in some systems
              matchesStop = hasPattern && isNorthbound;
            } else {
              // For IRT lines (2/5 at Winthrop), be more flexible
              // Stop IDs might be: 235, 235N, or other formats
              const baseStopId = stopId.replace('N', '').replace('S', '');
              const containsBaseId = stopIdStr.includes(baseStopId);
              
              // For Manhattan-bound (northbound), check for N suffix or direction
              // IRT northbound typically has N or directionId === 1
              // Also accept if it's just the number (235) - direction might be in trip
              const isNorthbound = stopIdStr.includes('N') || 
                                 stopIdStr.endsWith('N') ||
                                 stopIdStr === baseStopId || // Sometimes just the number
                                 stopIdStr.startsWith(baseStopId) ||
                                 (entity.tripUpdate.trip?.directionId === 1);
              
              matchesStop = containsBaseId && isNorthbound;
            }
            
            if (matchesStop) {
              const arrivalTime = stopUpdate.arrival?.time || stopUpdate.departure?.time;
              if (arrivalTime) {
                const currentTime = Math.floor(Date.now() / 1000);
                const minutesUntil = Math.round((arrivalTime - currentTime) / 60);
                if (minutesUntil >= 0 && minutesUntil < 60) {
                  const arrival = {
                    route: routeId,
                    minutes: minutesUntil,
                    arrivalTime: new Date(arrivalTime * 1000)
                  };
                  
                  // Add occupancy/crowding data if available
                  if (vehicleData) {
                    arrival.occupancyStatus = vehicleData.occupancyStatus;
                    arrival.occupancyPercentage = vehicleData.occupancyPercentage;
                  }
                  
                  arrivals.push(arrival);
                }
              }
            }
          }
        }
      }
    }

    return arrivals;
  } catch (error) {
    console.error(`Error fetching ${targetRoute} train data:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
    }
    return [];
  }
}

// Helper function to fetch subway data for B, Q, 2, and 5 trains
async function fetchSubwayData() {
  const churchAveArrivals = [];
  const winthropArrivals = [];
  
  // Fetch B train data from BDFM feed at Church Ave
  const bArrivals = await fetchSubwayFeed(B_TRAIN_FEED_URL, 'B', CHURCH_AVE_STOP_ID, ['D28', 'N']);
  churchAveArrivals.push(...bArrivals);
  
  // Fetch Q train data from NQRW feed at Church Ave
  const qArrivals = await fetchSubwayFeed(Q_TRAIN_FEED_URL, 'Q', CHURCH_AVE_STOP_ID, ['D28', 'N']);
  churchAveArrivals.push(...qArrivals);

  // Fetch 2 train data from IRT feed at Winthrop
  const train2Arrivals = await fetchSubwayFeed(IRT_FEED_URL, '2', WINTHROP_STOP_ID, ['241', 'N']);
  winthropArrivals.push(...train2Arrivals);
  
  // Fetch 5 train data from IRT feed at Winthrop
  const train5Arrivals = await fetchSubwayFeed(IRT_FEED_URL, '5', WINTHROP_STOP_ID, ['241', 'N']);
  winthropArrivals.push(...train5Arrivals);

  return {
    churchAve: churchAveArrivals.sort((a, b) => a.minutes - b.minutes).slice(0, 3),
    winthrop: winthropArrivals.sort((a, b) => a.minutes - b.minutes).slice(0, 3)
  };
}

// Helper function to fetch bus vehicle positions for occupancy and passenger count data
async function fetchBusVehiclePositions(routeId) {
  if (!BUS_TIME_API_KEY) {
    return new Map();
  }
  
  try {
    // Use SIRI vehicle monitoring API which has more detailed data including passenger counts
    const url = `https://bustime.mta.info/api/siri/vehicle-monitoring.json`;
    const response = await axios.get(url, {
      params: {
        key: BUS_TIME_API_KEY,
        VehicleMonitoringDetailLevel: 'calls',
        LineRef: `MTA NYCT_${routeId}`
      }
    });
    
    const vehicleMap = new Map();
    const vehicleActivities = response.data?.Siri?.ServiceDelivery?.VehicleMonitoringDelivery?.[0]?.VehicleActivity || [];
    
    for (const activity of vehicleActivities) {
      const journey = activity.MonitoredVehicleJourney;
      if (!journey) continue;
      
      // Get trip ID from FramedVehicleJourneyRef
      const tripId = journey.FramedVehicleJourneyRef?.DatedVehicleJourneyRef;
      if (!tripId) continue;
      
      // Extract occupancy and passenger count data
      const vehicleData = {
        occupancyStatus: journey.Occupancy,
        loadFactor: journey.LoadFactor,
        occupancyPercentage: journey.OccupancyPercentage,
        passengerCount: journey.PassengerCount || journey.Extensions?.Occupancy?.PassengerCount
      };
      
      // Check Extensions for additional data
      if (journey.Extensions) {
        if (journey.Extensions.Occupancy) {
          vehicleData.passengerCount = journey.Extensions.Occupancy.PassengerCount || vehicleData.passengerCount;
          vehicleData.occupancyPercentage = journey.Extensions.Occupancy.OccupancyPercentage || vehicleData.occupancyPercentage;
        }
      }
      
      vehicleMap.set(tripId, vehicleData);
    }
    
    return vehicleMap;
  } catch (error) {
    // SIRI endpoint might not be available or might fail
    // Try fallback to regular vehicles endpoint
    try {
      const url = `${BUS_TIME_BASE_URL}/vehicles-for-route/${routeId}.json`;
      const response = await axios.get(url, {
        params: {
          key: BUS_TIME_API_KEY,
          includePolylines: false
        }
      });
      
      const vehicleMap = new Map();
      const vehicles = response.data?.data?.list || [];
      
      for (const vehicle of vehicles) {
        const tripId = vehicle.tripId;
        if (tripId) {
          vehicleMap.set(tripId, {
            loadFactor: vehicle.loadFactor,
            occupancyStatus: vehicle.occupancyStatus,
            occupancyPercentage: vehicle.occupancyPercentage,
            passengerCount: vehicle.passengerCount
          });
        }
      }
      
      return vehicleMap;
    } catch (fallbackError) {
      // Both endpoints failed - return empty map
      console.warn(`Could not fetch vehicle positions for ${routeId}:`, fallbackError.message);
      return new Map();
    }
  }
}

// Helper function to fetch bus data using SIRI stop monitoring for real-time predictions
async function fetchBusDataSIRI(routeId, stopId) {
  if (!BUS_TIME_API_KEY) {
    return { arrivals: [], vehicleMap: new Map() };
  }
  
  try {
    // Use SIRI stop monitoring for real-time predicted arrival times
    const url = `https://bustime.mta.info/api/siri/stop-monitoring.json`;
    const response = await axios.get(url, {
      params: {
        key: BUS_TIME_API_KEY,
        MonitoringRef: stopId,
        LineRef: `MTA NYCT_${routeId}`
      }
    });
    
    const arrivals = [];
    const vehicleMap = new Map();
    
    const stopMonitoringDeliveries = response.data?.Siri?.ServiceDelivery?.StopMonitoringDelivery || [];
    
    for (const delivery of stopMonitoringDeliveries) {
      const monitoredStopVisits = delivery.MonitoredStopVisit || [];
      
      for (const visit of monitoredStopVisits) {
        const call = visit.MonitoredVehicleJourney?.MonitoredCall;
        const journey = visit.MonitoredVehicleJourney;
        
        if (!call || !journey) continue;
        
        // Get predicted or expected arrival time
        const arrivalTime = call.ExpectedArrivalTime || call.AimedArrivalTime;
        if (!arrivalTime) continue;
        
        // Parse ISO 8601 time string
        const arrivalTimestamp = new Date(arrivalTime).getTime();
        const minutesUntil = Math.round((arrivalTimestamp - Date.now()) / 60000);
        
        if (minutesUntil >= -2 && minutesUntil < 120) {
          const tripId = journey.FramedVehicleJourneyRef?.DatedVehicleJourneyRef;
          const tripHeadsign = journey.DestinationName || '';
          const isLimited = tripHeadsign.toUpperCase().includes('LTD') || 
                           tripHeadsign.toUpperCase().includes('LIMITED');
          
          // Get passenger count and capacity from Extensions.Capacities (this is where it is in SIRI)
          const extensions = call.Extensions || {};
          const capacities = extensions.Capacities || {};
          const passengerCount = capacities.EstimatedPassengerCount;
          const passengerCapacity = capacities.EstimatedPassengerCapacity;
          
          // Calculate percentage full if we have both count and capacity
          let occupancyPercentage = null;
          if (passengerCount !== undefined && passengerCount !== null && 
              passengerCapacity !== undefined && passengerCapacity !== null && 
              passengerCapacity > 0) {
            occupancyPercentage = Math.round((passengerCount / passengerCapacity) * 100);
          }
          
          const arrival = {
            route: journey.PublishedLineName || routeId,
            minutes: Math.max(0, minutesUntil),
            isLimited: isLimited,
            headsign: tripHeadsign,
            arrivalTime: new Date(arrivalTimestamp),
            tripId: tripId
          };
          
          // Add occupancy and passenger data
          if (journey.Occupancy) {
            arrival.occupancyStatus = journey.Occupancy;
          }
          if (passengerCount !== undefined && passengerCount !== null) {
            arrival.passengerCount = passengerCount;
          }
          if (passengerCapacity !== undefined && passengerCapacity !== null) {
            arrival.passengerCapacity = passengerCapacity;
          }
          if (occupancyPercentage !== null) {
            arrival.occupancyPercentage = occupancyPercentage;
          }
          if (capacities.EstimatedPassengerLoadFactor) {
            arrival.loadFactor = capacities.EstimatedPassengerLoadFactor;
          }
          
          arrivals.push(arrival);
          
          // Also store in vehicleMap for reference
          if (tripId) {
            vehicleMap.set(tripId, {
              occupancyStatus: journey.Occupancy,
              passengerCount: passengerCount
            });
          }
        }
      }
    }
    
    return { arrivals, vehicleMap };
  } catch (error) {
    console.warn(`SIRI stop monitoring failed for ${routeId} at ${stopId}:`, error.message);
    return { arrivals: [], vehicleMap: new Map() };
  }
}

// Helper function to fetch bus data
async function fetchBusData(routeId, stopId, direction) {
  if (!BUS_TIME_API_KEY) {
    console.warn('⚠️  BUS_TIME_API_KEY not set - skipping bus data fetch');
    return [];
  }
  
  try {
    // Try SIRI stop monitoring first for real-time predictions
    const siriData = await fetchBusDataSIRI(routeId, stopId);
    
    // If SIRI returns data, use it (it has real-time predictions)
    if (siriData.arrivals.length > 0) {
      // Add occupancy/passenger data from vehicle positions
      for (const arrival of siriData.arrivals) {
        if (arrival.tripId && siriData.vehicleMap.has(arrival.tripId)) {
          const vehicleData = siriData.vehicleMap.get(arrival.tripId);
          arrival.occupancyStatus = vehicleData.occupancyStatus;
          arrival.passengerCount = vehicleData.passengerCount;
        }
      }
      
      // Filter by direction if needed (for B49)
      if (direction && direction.toLowerCase().includes('fulton')) {
        return siriData.arrivals.filter(arrival => {
          const headsignLower = arrival.headsign.toLowerCase();
          return headsignLower.includes('fulton') ||
                 headsignLower.includes('bed stuy') ||
                 headsignLower.includes('bedford-stuyvesant') ||
                 headsignLower.includes('bed-stuy');
        });
      }
      
      return siriData.arrivals;
    }
    
    // Fallback to regular arrivals endpoint if SIRI doesn't return data
    // Fetch vehicle positions for occupancy data (if available)
    const vehiclePositions = await fetchBusVehiclePositions(`MTA NYCT_${routeId}`);
    
    // Bus Time API endpoint for arrivals
    // Include time window parameters to get scheduled arrivals, not just real-time predictions
    const url = `${BUS_TIME_BASE_URL}/arrivals-and-departures-for-stop/${stopId}.json`;
    const response = await axios.get(url, {
      params: {
        key: BUS_TIME_API_KEY,
        includePolylines: false,
        minutesBefore: 5, // Include buses that just passed (in case of slight delays)
        minutesAfter: 120  // Look ahead 2 hours for scheduled arrivals
      }
    });

    const arrivals = [];
    // The API returns arrivals in data.arrivalsAndDepartures (not data.entry.arrivalsAndDepartures)
    const predictions = response.data?.data?.arrivalsAndDepartures || [];
    
    // Debug: log if we get predictions but no matches
    if (predictions.length > 0) {
      console.log(`Found ${predictions.length} predictions for stop ${stopId}, route ${routeId}`);
    }
    
    // Try multiple route ID formats
    const routeIdVariants = [
      routeId,
      routeId.replace('MTA NYCT_', ''),
      `MTA NYCT_${routeId}`,
      routeId.replace('_', '')
    ];

    for (const prediction of predictions) {
      const predictionRouteId = prediction.routeId || '';
      const routeShortName = prediction.routeShortName || '';
      
      // Check if this prediction matches any of our route ID variants
      const matchesRoute = routeIdVariants.some(variant => 
        predictionRouteId.includes(variant) || 
        routeShortName === variant.replace('MTA NYCT_', '') ||
        routeShortName === variant
      );
      
      if (!matchesRoute) {
        continue;
      }

      const tripHeadsign = prediction.tripHeadsign || '';
      
      // Detect limited service - check multiple indicators
      const isLimited = 
        routeShortName.includes('Limited') || 
        routeShortName.includes('LTD') ||
        tripHeadsign.includes('Limited') ||
        tripHeadsign.includes('LTD') ||
        prediction.tripId?.includes('_LTD') ||
        prediction.tripId?.includes('_Limited') ||
        prediction.routeLongName?.includes('Limited');
      
      // Check direction if specified (more flexible matching)
      // Only filter for B49 which needs specific direction
      if (direction && direction.toLowerCase().includes('fulton')) {
        const headsignLower = tripHeadsign.toLowerCase();
        // For B49 to Fulton St
        const matchesDirection = 
          headsignLower.includes('fulton') ||
          headsignLower.includes('bed stuy') ||
          headsignLower.includes('bedford-stuyvesant') ||
          headsignLower.includes('bed-stuy');
        
        if (!matchesDirection) {
          continue;
        }
      }
      // For B41, don't filter by direction - show all B41 buses at the stop

      // Use predicted time if available, otherwise use scheduled time
      const predictedArrivalTime = prediction.predictedArrivalTime || prediction.scheduledArrivalTime;
      if (predictedArrivalTime) {
        // Convert from milliseconds to minutes
        const minutesUntil = Math.round((predictedArrivalTime - Date.now()) / 60000);
        // Show arrivals within the next 120 minutes (increased window to catch more buses)
        // Include buses that are slightly in the past (up to 2 minutes) in case of clock skew
        if (minutesUntil >= -2 && minutesUntil < 120) {
          const arrival = {
            route: routeShortName || routeId.replace('MTA NYCT_', ''),
            minutes: Math.max(0, minutesUntil), // Don't show negative minutes
            isLimited: isLimited,
            headsign: tripHeadsign,
            arrivalTime: new Date(predictedArrivalTime)
          };
          
          // Get occupancy data and passenger count from vehicle positions if available
          const tripId = prediction.tripId;
          if (tripId && vehiclePositions.has(tripId)) {
            const vehicleData = vehiclePositions.get(tripId);
            if (vehicleData.loadFactor !== undefined) {
              arrival.loadFactor = vehicleData.loadFactor;
            }
            if (vehicleData.occupancyStatus !== undefined) {
              arrival.occupancyStatus = vehicleData.occupancyStatus;
            }
            if (vehicleData.occupancyPercentage !== undefined) {
              arrival.occupancyPercentage = vehicleData.occupancyPercentage;
            }
            // Add passenger/rider count if available
            if (vehicleData.passengerCount !== undefined && vehicleData.passengerCount !== null) {
              arrival.passengerCount = vehicleData.passengerCount;
            }
          }
          
          // Also check for occupancy data directly in the prediction (if API adds it)
          if (prediction.loadFactor !== undefined) {
            arrival.loadFactor = prediction.loadFactor;
          }
          if (prediction.occupancyStatus !== undefined) {
            arrival.occupancyStatus = prediction.occupancyStatus;
          }
          if (prediction.occupancyPercentage !== undefined) {
            arrival.occupancyPercentage = prediction.occupancyPercentage;
          }
          
          arrivals.push(arrival);
        }
      }
    }

    // Return more arrivals to ensure we have enough Limited buses
    // Return more arrivals to ensure we capture Limited buses
    return arrivals.sort((a, b) => a.minutes - b.minutes).slice(0, 10);
  } catch (error) {
    console.error(`Error fetching bus data for ${routeId} at ${stopId}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return [];
  }
}

// API endpoint to get all arrival data
app.get('/api/arrivals', async (req, res) => {
  try {
    // Fetch subway data
    const subwayArrivals = await fetchSubwayData();

    // Fetch bus data
    // For B41 at Caton Ave - get Local buses only (Caton Ave only serves Local)
    const b41CatonAllArrivals = await fetchBusData('B41', B41_CATON_AVE_STOP, null);
    const b41CatonLocalArrivals = b41CatonAllArrivals
      .filter(arrival => !arrival.isLimited) // Only Local buses (Caton Ave doesn't have Limited)
      .map(arrival => ({
        ...arrival,
        location: 'Caton Ave',
        isLimited: false // Force Local for Caton Ave
      }))
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, 2); // Next 2 Local buses
    
    // For B41 at Clarkson Ave - get Limited buses only (Clarkson Ave only shows Limited)
    const b41ClarksonAllArrivals = await fetchBusData('B41', B41_CLARKSON_AVE_STOP, null);
    const b41ClarksonLimitedArrivals = b41ClarksonAllArrivals
      .filter(arrival => arrival.isLimited === true) // Only Limited buses (strict check)
      .map(arrival => ({
        ...arrival,
        location: 'Clarkson Ave',
        isLimited: true // Force Limited for Clarkson Ave
      }))
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, 2); // Next 2 Limited buses
    
    // Debug logging
    console.log(`B41 Caton Ave: ${b41CatonAllArrivals.length} total, ${b41CatonLocalArrivals.length} Local`);
    console.log(`B41 Clarkson Ave: ${b41ClarksonAllArrivals.length} total, ${b41ClarksonLimitedArrivals.length} Limited`);
    
    // Combine B41 arrivals: 2 Local from Caton Ave + 2 Limited from Clarkson Ave
    // Final safety filter: ensure Caton Ave only has Local, Clarkson Ave only has Limited
    const b41Combined = [...b41CatonLocalArrivals, ...b41ClarksonLimitedArrivals]
      .filter(arrival => {
        // Caton Ave must be Local
        if (arrival.location === 'Caton Ave' && arrival.isLimited) {
          return false;
        }
        // Clarkson Ave must be Limited
        if (arrival.location === 'Clarkson Ave' && !arrival.isLimited) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, 4); // Maximum 4 buses total
    
    // For B49 to Bed Stuy Fulton St at Rogers and Lenox Road
    const b49Arrivals = await fetchBusData('B49', B49_ROGERS_LENOX_STOP, 'Fulton');

    res.json({
      subway: {
        churchAve: subwayArrivals.churchAve,
        winthrop: subwayArrivals.winthrop
      },
      buses: {
        b41: b41Combined,
        b49: b49Arrivals
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /api/arrivals:', error);
    res.status(500).json({ error: 'Failed to fetch arrival data' });
  }
});

// Endpoint to search for stop IDs (helper endpoint)
app.get('/api/search-stops', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }

  if (!BUS_TIME_API_KEY) {
    return res.status(400).json({ error: 'BUS_TIME_API_KEY not configured' });
  }

  try {
    const url = `${BUS_TIME_BASE_URL}/stops-for-location.json`;
    const response = await axios.get(url, {
      params: {
        key: BUS_TIME_API_KEY,
        lat: 40.65, // Brooklyn approximate center
        lon: -73.95,
        radius: 5000,
        q: query
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error searching stops:', error.message);
    res.status(500).json({ error: 'Failed to search stops' });
  }
});

app.listen(PORT, () => {
  console.log(`MTA Display server running on http://localhost:${PORT}`);
  if (!BUS_TIME_API_KEY) {
    console.warn('⚠️  WARNING: BUS_TIME_API_KEY not configured. Bus data will not work until you set it in .env file');
  }
  console.log('✅ Subway feeds configured (no API key needed)');
});

