#!/usr/bin/env node

/**
 * Helper script to find MTA bus stop IDs
 * Usage: node find-stops.js "Caton Ave" "Brooklyn"
 */

const axios = require('axios');
require('dotenv').config();

const BUS_TIME_API_KEY = process.env.BUS_TIME_API_KEY || '';
const BUS_TIME_BASE_URL = 'https://bustime.mta.info/api/where';

if (!BUS_TIME_API_KEY) {
    console.error('❌ BUS_TIME_API_KEY not set in .env file');
    process.exit(1);
}

async function searchStops(query) {
    try {
        // Brooklyn approximate center coordinates
        const lat = 40.65;
        const lon = -73.95;
        const radius = 10000; // 10km radius

        const url = `${BUS_TIME_BASE_URL}/stops-for-location.json`;
        const response = await axios.get(url, {
            params: {
                key: BUS_TIME_API_KEY,
                lat: lat,
                lon: lon,
                radius: radius,
                q: query
            }
        });

        const stops = response.data?.data?.list || [];
        
        if (stops.length === 0) {
            console.log(`\n❌ No stops found for "${query}"`);
            return;
        }

        console.log(`\n✅ Found ${stops.length} stop(s) for "${query}":\n`);
        
        stops.forEach((stop, index) => {
            console.log(`${index + 1}. ${stop.name}`);
            console.log(`   Stop ID: ${stop.id}`);
            console.log(`   Routes: ${stop.routes?.map(r => r.shortName).join(', ') || 'N/A'}`);
            console.log(`   Location: ${stop.lat}, ${stop.lon}`);
            console.log('');
        });

    } catch (error) {
        console.error('Error searching stops:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

// Get search query from command line arguments
const query = process.argv.slice(2).join(' ');

if (!query) {
    console.log('Usage: node find-stops.js "YOUR_SEARCH_TERM"');
    console.log('Example: node find-stops.js "Caton Ave"');
    console.log('Example: node find-stops.js "Rogers Lenox"');
    process.exit(1);
}

searchStops(query);

