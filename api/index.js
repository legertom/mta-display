const express = require('express');
const cors = require('cors');
const axios = require('axios');
const gtfs = require('gtfs-realtime-bindings');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static files from public directory (fallback for Vercel)
app.use(express.static(path.join(__dirname, '../public')));

// MTA API Configuration
// Note: Subway feeds don't require an API key, but Bus Time API does
const BUS_TIME_API_KEY = process.env.BUS_TIME_API_KEY || '';

// Subway feed URLs
// B and Q trains are on different feeds:
// - B train: BDFM feed
// - Q train: NQRW feed
// - 2/5 trains: 123456 feed
const B_TRAIN_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm';
const Q_TRAIN_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw';
const IRT_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs';

// Bus Time API base URL
const BUS_TIME_BASE_URL = 'https://bustime.mta.info/api/where';

// GTFS-Realtime feed for buses (requires API key)
const BUS_GTFS_REALTIME_VEHICLES_URL = 'https://gtfsrt.prod.obanyc.com/vehiclePositions';

// Stop IDs (these may need to be verified/updated)
// Church Ave stop for B/Q trains (Manhattan-bound)
const CHURCH_AVE_STOP_ID = 'D28N'; // Northbound (Manhattan-bound) at Church Ave
// Winthrop St stop for 2/5 trains (Manhattan-bound)
const WINTHROP_ST_STOP_ID = '241N'; // Northbound (Manhattan-bound) at Winthrop St

// Bus stop IDs
// B41 stops on Flatbush Avenue
const B41_CATON_AVE_STOP = 'MTA_303241'; // FLATBUSH AV/CATON AV (try MTA_303308 if this doesn't work for Downtown direction)
const B41_CLARKSON_AVE_STOP = 'MTA_303242'; // FLATBUSH AV/CLARKSON AV
// B49 stop
const B49_ROGERS_LENOX_STOP = 'MTA_303944'; // ROGERS AV/LENOX RD

// Helper function to fetch subway data from a specific feed
async function fetchSubwayFeed(feedUrl, targetRoute, stopId, stopPrefix) {
  const arrivals = [];
  const vehiclePositions = new Map(); // Map trip IDs to vehicle positions for occupancy data
  
  try {
    // No API key needed for these public feeds
    const response = await axios.get(feedUrl, {
      responseType: 'arraybuffer',
      timeout: 10000 // 10 second timeout
    });

    const feed = gtfs.transit_realtime.FeedMessage.decode(response.data);

    // First pass: collect vehicle positions with occupancy data
    for (const entity of feed.entity) {
      if (entity.vehicle && entity.vehicle.trip && entity.vehicle.trip.routeId === targetRoute) {
        const tripId = entity.vehicle.trip.tripId;
        if (tripId && entity.vehicle.occupancyStatus !== undefined) {
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
            // Stop ID format might vary, so we check for partial match
            const currentStopId = stopUpdate.stopId || '';
            if (currentStopId === stopId || (currentStopId.includes(stopPrefix) && currentStopId.includes('N'))) {
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

// Helper function to fetch subway data for both B and Q trains at Church Ave
async function fetchSubwayData() {
  const allArrivals = [];
  
  // Fetch B train data from BDFM feed
  const bArrivals = await fetchSubwayFeed(B_TRAIN_FEED_URL, 'B', CHURCH_AVE_STOP_ID, 'D28');
  allArrivals.push(...bArrivals);
  
  // Fetch Q train data from NQRW feed
  const qArrivals = await fetchSubwayFeed(Q_TRAIN_FEED_URL, 'Q', CHURCH_AVE_STOP_ID, 'D28');
  allArrivals.push(...qArrivals);

  // Sort by arrival time and return next 2-3
  return allArrivals
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 3);
}

// Helper function to fetch subway data for 2/5 trains at Winthrop St
async function fetchWinthropData() {
  const allArrivals = [];
  
  // Fetch 2 train data from IRT feed
  const train2Arrivals = await fetchSubwayFeed(IRT_FEED_URL, '2', WINTHROP_ST_STOP_ID, '241');
  allArrivals.push(...train2Arrivals);
  
  // Fetch 5 train data from IRT feed
  const train5Arrivals = await fetchSubwayFeed(IRT_FEED_URL, '5', WINTHROP_ST_STOP_ID, '241');
  allArrivals.push(...train5Arrivals);

  // Sort by arrival time and return next 3
  return allArrivals
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 3);
}

// Helper function to fetch bus vehicle positions for occupancy data from GTFS-Realtime
async function fetchBusVehiclePositionsFromGTFS(routeId) {
  if (!BUS_TIME_API_KEY) {
    return { byTripId: new Map(), byVehicleId: new Map() };
  }
  
  try {
    // Fetch GTFS-Realtime VehiclePositions feed for buses
    const response = await axios.get(BUS_GTFS_REALTIME_VEHICLES_URL, {
      params: {
        key: BUS_TIME_API_KEY
      },
      responseType: 'arraybuffer',
      timeout: 10000 // 10 second timeout
    });

    const feed = gtfs.transit_realtime.FeedMessage.decode(response.data);
    const vehicleMapByTripId = new Map();
    const vehicleMapByVehicleId = new Map();
    
    // Extract route ID variants to match
    const routeIdVariants = [
      routeId,
      routeId.replace('MTA NYCT_', ''),
      `MTA NYCT_${routeId}`,
      routeId.replace('_', '')
    ];
    
    for (const entity of feed.entity) {
      if (entity.vehicle && entity.vehicle.trip) {
        const vehicleRouteId = entity.vehicle.trip.routeId || '';
        const tripId = entity.vehicle.trip.tripId;
        const vehicleId = entity.vehicle.vehicle?.id;
        
        // Check if this vehicle matches our route
        const matchesRoute = routeIdVariants.some(variant => 
          vehicleRouteId.includes(variant) || 
          vehicleRouteId === variant
        );
        
        if (matchesRoute && entity.vehicle.occupancyStatus !== undefined) {
          const occupancyData = {
            occupancyStatus: entity.vehicle.occupancyStatus,
            occupancyPercentage: entity.vehicle.occupancyPercentage
          };
          
          // Store by both tripId and vehicleId for flexible matching
          if (tripId) {
            vehicleMapByTripId.set(tripId, occupancyData);
          }
          if (vehicleId) {
            vehicleMapByVehicleId.set(vehicleId, occupancyData);
          }
        }
      }
    }
    
    return { byTripId: vehicleMapByTripId, byVehicleId: vehicleMapByVehicleId };
  } catch (error) {
    console.warn(`Warning: Could not fetch GTFS-Realtime vehicle positions for ${routeId}:`, error.message);
    return { byTripId: new Map(), byVehicleId: new Map() };
  }
}

// Helper function to fetch bus vehicle positions for occupancy data from REST API (fallback)
async function fetchBusVehiclePositions(routeId) {
  if (!BUS_TIME_API_KEY) {
    return { byTripId: new Map(), byVehicleId: new Map() };
  }
  
  // First try GTFS-Realtime (more reliable for occupancy data)
  const gtfsMaps = await fetchBusVehiclePositionsFromGTFS(routeId);
  if (gtfsMaps.byTripId.size > 0 || gtfsMaps.byVehicleId.size > 0) {
    return gtfsMaps;
  }
  
  // Fallback to REST API
  try {
    // Fetch vehicle positions for the route
    const url = `${BUS_TIME_BASE_URL}/vehicles-for-route/${routeId}.json`;
    const response = await axios.get(url, {
      params: {
        key: BUS_TIME_API_KEY,
        includePolylines: false
      },
      timeout: 10000 // 10 second timeout
    });
    
    const vehicleMapByTripId = new Map();
    const vehicleMapByVehicleId = new Map();
    const vehicles = response.data?.data?.list || [];
    
    for (const vehicle of vehicles) {
      const tripId = vehicle.tripId;
      const vehicleId = vehicle.vehicleId;
      const occupancyData = {
        loadFactor: vehicle.loadFactor,
        occupancyStatus: vehicle.occupancyStatus,
        occupancyPercentage: vehicle.occupancyPercentage
      };
      
      if (tripId) {
        vehicleMapByTripId.set(tripId, occupancyData);
      }
      if (vehicleId) {
        vehicleMapByVehicleId.set(vehicleId, occupancyData);
      }
    }
    
    return { byTripId: vehicleMapByTripId, byVehicleId: vehicleMapByVehicleId };
  } catch (error) {
    // Vehicle positions endpoint might not be available or might fail
    // Return empty maps - occupancy data is optional
    console.warn(`Warning: Could not fetch REST API vehicle positions for ${routeId}:`, error.message);
    return { byTripId: new Map(), byVehicleId: new Map() };
  }
}

// Helper function to fetch bus data using SIRI API (more reliable real-time predictions)
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
      },
      timeout: 10000
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
          
          // Get passenger count and capacity from Extensions.Capacities
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
    
    // Bus Time API endpoint for arrivals with time window parameters
    const url = `${BUS_TIME_BASE_URL}/arrivals-and-departures-for-stop/${stopId}.json`;
    const response = await axios.get(url, {
      params: {
        key: BUS_TIME_API_KEY,
        includePolylines: false,
        minutesBefore: 5,
        minutesAfter: 120
      },
      timeout: 10000 // 10 second timeout
    });

    const arrivals = [];
    // The API returns arrivals in data.arrivalsAndDepartures (not data.entry.arrivalsAndDepartures)
    const predictions = response.data?.data?.arrivalsAndDepartures || [];
    
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
      if (direction) {
        const directionLower = direction.toLowerCase();
        const headsignLower = tripHeadsign.toLowerCase();
        // Match if headsign contains direction keywords
        // For "Cadman Plaza" - look for "cadman" or "downtown"
        // For "Fulton St" - look for "fulton" or "bed stuy"
        const directionKeywords = {
          'cadman plaza': ['cadman', 'downtown'],
          'fulton': ['fulton', 'bed stuy', 'bedford-stuyvesant']
        };
        
        let matchesDirection = headsignLower.includes(directionLower);
        if (!matchesDirection) {
          // Try keyword matching
          for (const [key, keywords] of Object.entries(directionKeywords)) {
            if (directionLower.includes(key)) {
              matchesDirection = keywords.some(kw => headsignLower.includes(kw));
              break;
            }
          }
        }
        
        if (!matchesDirection) {
          continue;
        }
      }

      // Use predicted time if available, otherwise use scheduled time
      const predictedArrivalTime = prediction.predictedArrivalTime || prediction.scheduledArrivalTime;
      if (predictedArrivalTime) {
        // Convert from milliseconds to minutes
        const minutesUntil = Math.round((predictedArrivalTime - Date.now()) / 60000);
        // Show arrivals within the next 90 minutes (increased to get more Limited buses)
        if (minutesUntil >= 0 && minutesUntil < 90) {
          const arrival = {
            route: routeShortName || routeId.replace('MTA NYCT_', ''),
            minutes: minutesUntil,
            isLimited: isLimited,
            headsign: tripHeadsign,
            arrivalTime: new Date(predictedArrivalTime)
          };
          
          // Get occupancy data - try multiple sources
          const tripId = prediction.tripId;
          const vehicleId = prediction.vehicleId;
          
          // First, check if occupancy data is directly in the prediction
          // The MTA Bus Time API may include occupancy data directly in the arrival prediction
          if (prediction.loadFactor !== undefined && prediction.loadFactor !== null) {
            arrival.loadFactor = prediction.loadFactor;
          }
          if (prediction.occupancyStatus !== undefined && prediction.occupancyStatus !== null) {
            arrival.occupancyStatus = prediction.occupancyStatus;
          }
          if (prediction.occupancyPercentage !== undefined && prediction.occupancyPercentage !== null) {
            arrival.occupancyPercentage = prediction.occupancyPercentage;
          }
          
          // Also check nested structures - sometimes occupancy is in vehicle reference
          if (prediction.vehicleId && response.data?.data?.references?.vehicles) {
            const vehicleRef = response.data.data.references.vehicles.find(v => v.id === prediction.vehicleId);
            if (vehicleRef) {
              if (!arrival.loadFactor && vehicleRef.loadFactor !== undefined && vehicleRef.loadFactor !== null) {
                arrival.loadFactor = vehicleRef.loadFactor;
              }
              if (!arrival.occupancyStatus && vehicleRef.occupancyStatus !== undefined && vehicleRef.occupancyStatus !== null) {
                arrival.occupancyStatus = vehicleRef.occupancyStatus;
              }
              if (!arrival.occupancyPercentage && vehicleRef.occupancyPercentage !== undefined && vehicleRef.occupancyPercentage !== null) {
                arrival.occupancyPercentage = vehicleRef.occupancyPercentage;
              }
            }
          }
          
          // Try to match with vehicle positions
          // Handle both new format (object with byTripId/byVehicleId) and old format (Map)
          let vehicleData = null;
          
          if (vehiclePositions && typeof vehiclePositions === 'object' && !(vehiclePositions instanceof Map)) {
            // New format: object with byTripId and byVehicleId maps
            // Try vehicleId first (more reliable for matching)
            if (vehicleId && vehiclePositions.byVehicleId && vehiclePositions.byVehicleId.has(vehicleId)) {
              vehicleData = vehiclePositions.byVehicleId.get(vehicleId);
            }
            // Fallback to tripId
            if (!vehicleData && tripId && vehiclePositions.byTripId && vehiclePositions.byTripId.has(tripId)) {
              vehicleData = vehiclePositions.byTripId.get(tripId);
            }
          } else if (vehiclePositions instanceof Map) {
            // Old format: single Map keyed by tripId (backwards compatibility)
            if (tripId && vehiclePositions.has(tripId)) {
              vehicleData = vehiclePositions.get(tripId);
            }
          }
          
          // Apply vehicle data if found
          if (vehicleData) {
            // Only use vehicle position data if we don't already have it from prediction
            if (arrival.loadFactor === undefined && vehicleData.loadFactor !== undefined && vehicleData.loadFactor !== null) {
              arrival.loadFactor = vehicleData.loadFactor;
            }
            if (arrival.occupancyStatus === undefined && vehicleData.occupancyStatus !== undefined && vehicleData.occupancyStatus !== null) {
              arrival.occupancyStatus = vehicleData.occupancyStatus;
            }
            if (arrival.occupancyPercentage === undefined && vehicleData.occupancyPercentage !== undefined && vehicleData.occupancyPercentage !== null) {
              arrival.occupancyPercentage = vehicleData.occupancyPercentage;
            }
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
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout - MTA API took too long to respond');
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('Network error - unable to reach MTA API');
    }
    return [];
  }
}

// API endpoint to get all arrival data
// Returns partial data even if some sources fail - graceful degradation
app.get('/api/arrivals', async (req, res) => {
  const errors = [];
  const result = {
    subway: { churchAve: [], winthrop: [] },
    buses: { b41: [], b49: [] },
    timestamp: new Date().toISOString(),
    errors: []
  };

  try {
    // Fetch subway data (non-blocking - if it fails, continue with buses)
    try {
      result.subway.churchAve = await fetchSubwayData();
    } catch (error) {
      console.error('Error fetching Church Ave subway data:', error.message);
      errors.push('Church Ave subway data temporarily unavailable');
      result.errors.push('subway-churchave');
    }

    try {
      result.subway.winthrop = await fetchWinthropData();
    } catch (error) {
      console.error('Error fetching Winthrop subway data:', error.message);
      errors.push('Winthrop subway data temporarily unavailable');
      result.errors.push('subway-winthrop');
    }

    // Fetch bus data (non-blocking - each route independent)
    try {
      // For B41 at Caton Ave - get Local buses only (Caton Ave only serves Local)
      // Since the stop itself determines service type, take all buses and mark as Local
      const b41CatonAllArrivals = await fetchBusData('B41', B41_CATON_AVE_STOP, 'Cadman Plaza');
      const b41CatonLocalArrivals = b41CatonAllArrivals
        .map(arrival => ({
          ...arrival,
          location: 'Caton Ave',
          isLimited: false // Force Local for Caton Ave (stop determines service type)
        }))
        .sort((a, b) => a.minutes - b.minutes)
        .slice(0, 2); // Next 2 Local buses
      
      // For B41 at Clarkson Ave - get Limited buses only (Clarkson Ave only shows Limited)
      // Since the stop itself determines service type, take all buses and mark as Limited
      const b41ClarksonAllArrivals = await fetchBusData('B41', B41_CLARKSON_AVE_STOP, 'Cadman Plaza');
      const b41ClarksonLimitedArrivals = b41ClarksonAllArrivals
        .map(arrival => ({
          ...arrival,
          location: 'Clarkson Ave',
          isLimited: true // Force Limited for Clarkson Ave (stop determines service type)
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
      
      result.buses.b41 = b41Combined;
    } catch (error) {
      console.error('Error fetching B41 data:', error.message);
      errors.push('B41 bus data temporarily unavailable');
      result.errors.push('b41');
    }

    try {
      // For B49 to Bed Stuy Fulton St at Rogers and Lenox Road
      // Try with direction filter first
      let b49Arrivals = await fetchBusData('B49', B49_ROGERS_LENOX_STOP, 'Fulton');
      
      // If no results with direction filter, try without it (some buses might not have clear direction in headsign)
      if (b49Arrivals.length === 0) {
        console.log('B49: No results with direction filter, trying without direction filter');
        b49Arrivals = await fetchBusData('B49', B49_ROGERS_LENOX_STOP, null);
      }
      
      result.buses.b49 = b49Arrivals;
    } catch (error) {
      console.error('Error fetching B49 data:', error.message);
      errors.push('B49 bus data temporarily unavailable');
      result.errors.push('b49');
    }

    // Return partial results even if some sources failed
    // Only return 500 if ALL sources failed
    const hasAnyData = result.subway.churchAve.length > 0 || 
                       result.subway.winthrop.length > 0 ||
                       result.buses.b41.length > 0 || 
                       result.buses.b49.length > 0;

    if (errors.length > 0) {
      result.warnings = errors;
    }

    if (hasAnyData || errors.length === 0) {
      res.json(result);
    } else {
      res.status(503).json({
        error: 'All data sources are currently unavailable',
        message: 'Please try again in a moment',
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('Unexpected error in /api/arrivals:', error);
    res.status(500).json({
      error: 'An unexpected error occurred',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint to search for stop IDs (helper endpoint)
app.get('/api/search-stops', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ 
      error: 'Query parameter required',
      message: 'Please provide a search query using ?q=your_search_term'
    });
  }

  if (!BUS_TIME_API_KEY) {
    return res.status(503).json({ 
      error: 'BUS_TIME_API_KEY not configured',
      message: 'Bus stop search requires API key configuration'
    });
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
      },
      timeout: 10000 // 10 second timeout
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error searching stops:', error.message);
    if (error.code === 'ECONNABORTED') {
      res.status(504).json({ 
        error: 'Request timeout',
        message: 'The search took too long. Please try again.'
      });
    } else if (error.response) {
      res.status(error.response.status).json({ 
        error: 'Search failed',
        message: error.response.data?.message || 'Unable to search stops at this time'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to search stops',
        message: 'An unexpected error occurred'
      });
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      subway: 'available',
      bus: BUS_TIME_API_KEY ? 'available' : 'api_key_missing'
    },
    environment: {
      hasBusApiKey: !!BUS_TIME_API_KEY,
      apiKeyLength: BUS_TIME_API_KEY ? BUS_TIME_API_KEY.length : 0,
      nodeEnv: process.env.NODE_ENV || 'not_set',
      vercel: !!process.env.VERCEL
    }
  });
});

// Debug endpoint to test bus API and see raw responses
app.get('/api/debug/bus', async (req, res) => {
  if (!BUS_TIME_API_KEY) {
    return res.status(400).json({ error: 'BUS_TIME_API_KEY not configured' });
  }

  const routeId = req.query.route || 'B41';
  const stopId = req.query.stop || B41_CATON_AVE_STOP;

  try {
    // Test 1: Get vehicle positions
    let vehiclePositionsData = null;
    try {
      const vehicleUrl = `${BUS_TIME_BASE_URL}/vehicles-for-route/MTA NYCT_${routeId}.json`;
      const vehicleResponse = await axios.get(vehicleUrl, {
        params: {
          key: BUS_TIME_API_KEY,
          includePolylines: false
        },
        timeout: 10000 // 10 second timeout
      });
      vehiclePositionsData = {
        url: vehicleUrl,
        status: 'success',
        vehicleCount: vehicleResponse.data?.data?.list?.length || 0,
        vehicles: vehicleResponse.data?.data?.list?.slice(0, 3).map(v => ({
          tripId: v.tripId,
          vehicleId: v.vehicleId,
          loadFactor: v.loadFactor,
          occupancyStatus: v.occupancyStatus,
          occupancyPercentage: v.occupancyPercentage,
          routeShortName: v.routeShortName
        })) || [],
        rawSample: vehicleResponse.data?.data?.list?.[0] || null
      };
    } catch (error) {
      vehiclePositionsData = {
        status: 'error',
        error: error.message,
        response: error.response?.data || null
      };
    }

    // Test 2: Get arrivals
    let arrivalsData = null;
    try {
      const arrivalsUrl = `${BUS_TIME_BASE_URL}/arrivals-and-departures-for-stop/${stopId}.json`;
      const arrivalsResponse = await axios.get(arrivalsUrl, {
        params: {
          key: BUS_TIME_API_KEY,
          includePolylines: false
        },
        timeout: 10000 // 10 second timeout
      });
      
      const predictions = arrivalsResponse.data?.data?.arrivalsAndDepartures || [];
      const routePredictions = predictions.filter(p => {
        const routeShortName = p.routeShortName || '';
        const routeIdFromPred = p.routeId || '';
        return routeShortName.includes(routeId) || routeIdFromPred.includes(routeId);
      });

      arrivalsData = {
        url: arrivalsUrl,
        status: 'success',
        totalPredictions: predictions.length,
        routePredictions: routePredictions.length,
        samplePredictions: routePredictions.slice(0, 3).map(p => ({
          tripId: p.tripId,
          vehicleId: p.vehicleId,
          routeShortName: p.routeShortName,
          routeId: p.routeId,
          loadFactor: p.loadFactor,
          occupancyStatus: p.occupancyStatus,
          occupancyPercentage: p.occupancyPercentage,
          tripHeadsign: p.tripHeadsign,
          predictedArrivalTime: p.predictedArrivalTime,
          scheduledArrivalTime: p.scheduledArrivalTime,
          // Check nested structures
          situationIds: p.situationIds,
          hasVehicleRef: !!p.vehicleId
        })),
        rawSample: routePredictions[0] || null
      };
    } catch (error) {
      arrivalsData = {
        status: 'error',
        error: error.message,
        response: error.response?.data || null
      };
    }

    // Test 3: Try to match tripIds
    const matchingInfo = {
      vehicleTripIds: vehiclePositionsData.vehicles?.map(v => v.tripId) || [],
      predictionTripIds: arrivalsData.samplePredictions?.map(p => p.tripId) || [],
      matches: []
    };

    if (vehiclePositionsData.vehicles && arrivalsData.samplePredictions) {
      matchingInfo.matches = vehiclePositionsData.vehicles
        .filter(v => v.tripId && arrivalsData.samplePredictions.some(p => p.tripId === v.tripId))
        .map(v => ({
          tripId: v.tripId,
          vehicleData: v,
          predictionData: arrivalsData.samplePredictions.find(p => p.tripId === v.tripId)
        }));
    }

    res.json({
      routeId,
      stopId,
      timestamp: new Date().toISOString(),
      vehiclePositions: vehiclePositionsData,
      arrivals: arrivalsData,
      matching: matchingInfo,
      note: 'This endpoint shows raw API responses to help debug occupancy data extraction'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Debug endpoint failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Serve index.html for root and all non-API routes (SPA fallback)
app.get('*', (req, res) => {
  // Don't serve HTML for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'Not Found',
      message: `API endpoint ${req.path} does not exist`,
      availableEndpoints: ['/api/arrivals', '/api/search-stops', '/api/health']
    });
  }
  
  // Serve index.html for all other routes (SPA routing)
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Export the Express app as a serverless function for Vercel
// Vercel will automatically handle routing /api/* to this function
module.exports = app;

