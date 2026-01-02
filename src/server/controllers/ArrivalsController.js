const mtaService = require('../services/MtaService');

class ArrivalsController {
    async getArrivals(req, res) {
        try {
            const data = await mtaService.getAllArrivals();
            res.json(data);
        } catch (error) {
            console.error('Controller Error:', error);
            res.status(500).json({ error: 'Failed to fetch arrival data' });
        }
    }
}

module.exports = new ArrivalsController();
