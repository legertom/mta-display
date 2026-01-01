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
const IRT_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-1234567S';

// Bus Time API base URL
const BUS_TIME_BASE_URL = 'https://bustime.mta.info/api/where';

// Stop IDs (these may need to be verified/updated)
// Church Ave stop for B/Q trains (Manhattan-bound)
const CHURCH_AVE_STOP_ID = 'D28N'; // Northbound (Manhattan-bound) at Church Ave
// Winthrop St stop for 2/5 trains (Manhattan-bound)
// IRT stop IDs: 235N (northbound/Manhattan-bound) or 235 (with direction in trip)
const WINTHROP_STOP_ID = '235N'; // Northbound (Manhattan-bound) at Winthrop St

// Bus stop IDs
// B41 stops on Flatbush Avenue
const B41_CATON_AVE_STOP = 'MTA_303241'; // FLATBUSH AV/CATON AV (try MTA_303308 if this doesn't work for Downtown direction)
const B41_CLARKSON_AVE_STOP = 'MTA_303242'; // FLATBUSH AV/CLARKSON AV
// B49 stop
const B49_ROGERS_LENOX_STOP = 'MTA_303944'; // ROGERS AV/LENOX RD

// Helper function to fetch subway data from a specific feed
async function fetchSubwayFeed(feedUrl, targetRoute, stopId, stopIdPattern) {
  const arrivals = [];
  
  try {
    // No API key needed for these public feeds
    const response = await axios.get(feedUrl, {
      responseType: 'arraybuffer'
    });

    const feed = gtfs.transit_realtime.FeedMessage.decode(response.data);

    // Filter for target route at specified stop going Manhattan-bound
    for (const entity of feed.entity) {
      if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
        const routeId = entity.tripUpdate.trip.routeId;
        
        if (routeId === targetRoute) {
          for (const stopUpdate of entity.tripUpdate.stopTimeUpdate) {
            // Check if this stop matches the target stop (Manhattan-bound)
            const stopIdStr = stopUpdate.stopId || '';
            let matchesStop = false;
            
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
              // Exact match or includes stop ID
              // For IRT, also try just the number (235) with N suffix or in trip direction
              matchesStop = stopIdStr === stopId || 
                          stopIdStr.includes(stopId) || 
                          (stopIdStr.includes(stopId.replace('N', '')) && stopIdStr.includes('N'));
            }
            
            if (matchesStop) {
              const arrivalTime = stopUpdate.arrival?.time || stopUpdate.departure?.time;
              if (arrivalTime) {
                const currentTime = Math.floor(Date.now() / 1000);
                const minutesUntil = Math.round((arrivalTime - currentTime) / 60);
                if (minutesUntil >= 0 && minutesUntil < 60) {
                  arrivals.push({
                    route: routeId,
                    minutes: minutesUntil,
                    arrivalTime: new Date(arrivalTime * 1000)
                  });
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
  // Try multiple stop ID formats: 235N, 235, or any stop containing 235 with N
  const train2Arrivals = await fetchSubwayFeed(IRT_FEED_URL, '2', WINTHROP_STOP_ID, ['235']);
  winthropArrivals.push(...train2Arrivals);
  
  // Fetch 5 train data from IRT feed at Winthrop
  const train5Arrivals = await fetchSubwayFeed(IRT_FEED_URL, '5', WINTHROP_STOP_ID, ['235']);
  winthropArrivals.push(...train5Arrivals);

  return {
    churchAve: churchAveArrivals.sort((a, b) => a.minutes - b.minutes).slice(0, 3),
    winthrop: winthropArrivals.sort((a, b) => a.minutes - b.minutes).slice(0, 3)
  };
}

// Helper function to fetch bus data
async function fetchBusData(routeId, stopId, direction) {
  if (!BUS_TIME_API_KEY) {
    console.warn('⚠️  BUS_TIME_API_KEY not set - skipping bus data fetch');
    return [];
  }
  
  try {
    // Bus Time API endpoint for arrivals
    const url = `${BUS_TIME_BASE_URL}/arrivals-and-departures-for-stop/${stopId}.json`;
    const response = await axios.get(url, {
      params: {
        key: BUS_TIME_API_KEY,
        includePolylines: false
      }
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
          arrivals.push({
            route: routeShortName || routeId.replace('MTA NYCT_', ''),
            minutes: minutesUntil,
            isLimited: isLimited,
            headsign: tripHeadsign,
            arrivalTime: new Date(predictedArrivalTime)
          });
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
    // For B41 to Downtown Brooklyn Cadman Plaza at Caton Ave (Local)
    const b41CatonArrivals = await fetchBusData('B41', B41_CATON_AVE_STOP, 'Cadman Plaza');
    // Add location info to Caton Ave arrivals (these are local)
    b41CatonArrivals.forEach(arrival => {
      arrival.location = 'Caton Ave';
      arrival.isLimited = false; // Caton Ave only has local
    });
    
    // For B41 at Clarkson Ave - fetch all buses (both Local and Limited)
    const b41ClarksonAllArrivals = await fetchBusData('B41', B41_CLARKSON_AVE_STOP, 'Cadman Plaza');
    // Add location info to all Clarkson Ave arrivals (both local and limited)
    const b41ClarksonArrivals = b41ClarksonAllArrivals.map(arrival => ({
      ...arrival,
      location: 'Clarkson Ave'
    }));
    
    // Combine B41 arrivals: Local from Caton, and both Local and Limited from Clarkson
    // Sort by arrival time and limit to show next arrivals
    const b41Combined = [...b41CatonArrivals, ...b41ClarksonArrivals]
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, 8); // Show up to 8 total (mix of local and limited from both stops)
    
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

