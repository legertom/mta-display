# MTA Arrival Times Display

A web application that displays real-time arrival times for NYC MTA subway and bus routes.

## Features

- **Subway**: B and Q trains (Manhattan-bound) at Church Ave stop in Brooklyn
- **B41 Bus**: Arrivals at Caton Ave (to Downtown Brooklyn Cadman Plaza)
- **B41 Limited**: Arrivals at Clarkson Ave (to Downtown Brooklyn Cadman Plaza)
- **B49 Bus**: Arrivals at Rogers & Lenox Road (to Bed Stuy Fulton St)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Get API Keys

**Note:** Subway real-time feeds are publicly available and don't require an API key!

You'll need one API key for bus data:

1. **Bus Time API Key** (for bus data):
   - Visit https://bustime.mta.info/
   - Sign up for a developer account
   - Get your API key

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
BUS_TIME_API_KEY=your_bus_time_api_key_here
PORT=3001
```

**Note:** Subway feeds don't require an API key, so you only need the Bus Time API key. The app will work for subway data even without the bus API key, but bus data won't be available until you add it.

### 4. Find Stop IDs

**Quick Method - Use the helper script:**

```bash
node find-stops.js "Caton Ave"
node find-stops.js "Clarkson Ave"
node find-stops.js "Rogers Lenox"
```

This will search for stops and display their IDs, routes, and locations.

The stop IDs in `server.js` are placeholders. You'll need to find the actual stop IDs:

**For Bus Stops:**
1. Use the Bus Time API's stop search endpoint
2. Visit: `http://localhost:3000/api/search-stops?q=YOUR_SEARCH_TERM`
3. Or use the MTA's static GTFS data to find stop IDs

**For Subway Stops:**
- Church Ave stop ID for B/Q trains (Manhattan-bound) should be in the format like `D28N` or similar
- Check the MTA's static GTFS data for the exact stop ID

**Finding Stop IDs:**
- You can use the MTA's GTFS static data: https://transitfeeds.com/p/mta/79
- Or use the Bus Time API's location search: `https://bustime.mta.info/api/where/stops-for-location.json?key=YOUR_KEY&lat=40.65&lon=-73.95&radius=5000`

### 5. Update Stop IDs in server.js

Once you have the correct stop IDs, update them in `server.js`:

```javascript
// Bus stop IDs
const B41_CATON_AVE_STOP = 'YOUR_STOP_ID';
const B41_CLARKSON_AVE_STOP = 'YOUR_STOP_ID';
const B49_ROGERS_LENOX_STOP = 'YOUR_STOP_ID';

// Subway stop ID
const CHURCH_AVE_STOP_ID = 'YOUR_STOP_ID';
```

### 6. Run the Application

```bash
npm start
```

The application will be available at `http://localhost:3000`

## API Endpoints

- `GET /` - Main web interface
- `GET /api/arrivals` - Get all arrival data (JSON)
- `GET /api/search-stops?q=QUERY` - Search for bus stops (helper endpoint)

## Features

- Real-time arrival times updated every 30 seconds
- Clean, modern UI with responsive design
- Automatic refresh and manual refresh button
- Displays local vs. limited bus service
- Shows minutes until arrival or "Arriving" for imminent arrivals

## Troubleshooting

### API Keys Not Working
- Make sure your API keys are correctly set in the `.env` file
- Verify your API keys are active on the MTA developer portal
- Check the server console for specific error messages

### No Data Showing
- Verify the stop IDs are correct
- Check that the routes are running (not during service disruptions)
- Ensure your API keys have access to the required feeds

### CORS Errors
- The backend server handles CORS, so this shouldn't be an issue
- If you see CORS errors, make sure you're accessing the app through the server (not file://)

## Notes

- The app uses the MTA's real-time feeds, which may have occasional delays
- Stop IDs may need to be updated if the MTA changes their GTFS data
- Some bus routes may use different route ID formats (e.g., `MTA NYCT_B41` vs `B41`)

## License

MIT

