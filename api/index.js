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
const B_TRAIN_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm';
const Q_TRAIN_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw';

// Bus Time API base URL
const BUS_TIME_BASE_URL = 'https://bustime.mta.info/api/where';

// Stop IDs (these may need to be verified/updated)
// Church Ave stop for B/Q trains (Manhattan-bound)
const CHURCH_AVE_STOP_ID = 'D28N'; // Northbound (Manhattan-bound) at Church Ave

// Bus stop IDs
// B41 stops on Flatbush Avenue
const B41_CATON_AVE_STOP = 'MTA_303241'; // FLATBUSH AV/CATON AV (try MTA_303308 if this doesn't work for Downtown direction)
const B41_CLARKSON_AVE_STOP = 'MTA_303242'; // FLATBUSH AV/CLARKSON AV
// B49 stop
const B49_ROGERS_LENOX_STOP = 'MTA_303944'; // ROGERS AV/LENOX RD

// Helper function to fetch subway data from a specific feed
async function fetchSubwayFeed(feedUrl, targetRoute) {
  const arrivals = [];
  
  try {
    // No API key needed for these public feeds
    const response = await axios.get(feedUrl, {
      responseType: 'arraybuffer'
    });

    const feed = gtfs.transit_realtime.FeedMessage.decode(response.data);

    // Filter for target route at Church Ave going Manhattan-bound
    for (const entity of feed.entity) {
      if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
        const routeId = entity.tripUpdate.trip.routeId;
        
        if (routeId === targetRoute) {
          for (const stopUpdate of entity.tripUpdate.stopTimeUpdate) {
            // Check if this stop matches Church Ave (Manhattan-bound)
            // Stop ID format might vary, so we check for partial match
            const stopId = stopUpdate.stopId || '';
            if (stopId === CHURCH_AVE_STOP_ID || (stopId.includes('D28') && stopId.includes('N'))) {
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

// Helper function to fetch subway data for both B and Q trains
async function fetchSubwayData() {
  const allArrivals = [];
  
  // Fetch B train data from BDFM feed
  const bArrivals = await fetchSubwayFeed(B_TRAIN_FEED_URL, 'B');
  allArrivals.push(...bArrivals);
  
  // Fetch Q train data from NQRW feed
  const qArrivals = await fetchSubwayFeed(Q_TRAIN_FEED_URL, 'Q');
  allArrivals.push(...qArrivals);

  // Sort by arrival time and return next 2-3
  return allArrivals
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 3);
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
// Returns partial data even if some sources fail - graceful degradation
app.get('/api/arrivals', async (req, res) => {
  const errors = [];
  const result = {
    subway: { churchAve: [] },
    buses: { b41: [], b49: [] },
    timestamp: new Date().toISOString(),
    errors: []
  };

  try {
    // Fetch subway data (non-blocking - if it fails, continue with buses)
    try {
      result.subway.churchAve = await fetchSubwayData();
    } catch (error) {
      console.error('Error fetching subway data:', error.message);
      errors.push('Subway data temporarily unavailable');
      result.errors.push('subway');
    }

    // Fetch bus data (non-blocking - each route independent)
    try {
      // For B41 to Downtown Brooklyn Cadman Plaza at Caton Ave (Local)
      const b41CatonArrivals = await fetchBusData('B41', B41_CATON_AVE_STOP, 'Cadman Plaza');
      b41CatonArrivals.forEach(arrival => {
        arrival.location = 'Caton Ave';
        arrival.isLimited = false;
      });
      
      // For B41 at Clarkson Ave - fetch all buses (both Local and Limited)
      const b41ClarksonAllArrivals = await fetchBusData('B41', B41_CLARKSON_AVE_STOP, 'Cadman Plaza');
      const b41ClarksonArrivals = b41ClarksonAllArrivals.map(arrival => ({
        ...arrival,
        location: 'Clarkson Ave'
      }));
      
      // Combine B41 arrivals
      result.buses.b41 = [...b41CatonArrivals, ...b41ClarksonArrivals]
        .sort((a, b) => a.minutes - b.minutes)
        .slice(0, 8);
    } catch (error) {
      console.error('Error fetching B41 data:', error.message);
      errors.push('B41 bus data temporarily unavailable');
      result.errors.push('b41');
    }

    try {
      // For B49 to Bed Stuy Fulton St at Rogers and Lenox Road
      result.buses.b49 = await fetchBusData('B49', B49_ROGERS_LENOX_STOP, 'Fulton');
    } catch (error) {
      console.error('Error fetching B49 data:', error.message);
      errors.push('B49 bus data temporarily unavailable');
      result.errors.push('b49');
    }

    // Return partial results even if some sources failed
    // Only return 500 if ALL sources failed
    const hasAnyData = result.subway.churchAve.length > 0 || 
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
    }
  });
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

