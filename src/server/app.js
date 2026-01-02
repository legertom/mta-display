const express = require('express');
const cors = require('cors');
const path = require('path');
const arrivalsController = require('./controllers/ArrivalsController');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));
// app.use('/js', express.static(path.join(__dirname, '../client'))); // Removed: client files moved to public/js

// Routes
// We could move these to a separate routes file if it grows, 
// but for 2 endpoints, inline is fine.
app.get('/api/arrivals', (req, res) => arrivalsController.getArrivals(req, res));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error Handling Middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
