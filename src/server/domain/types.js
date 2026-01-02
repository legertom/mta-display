/**
 * @typedef {Object} Arrival
 * @property {string} route - The route identifier (e.g., "Q", "B41")
 * @property {number} minutes - Minutes until arrival
 * @property {Date} arrivalTime - Absolute timestamp of arrival
 * @property {string} [destination] - Trip headsign/destination
 * @property {string} [station] - Station name (Subway) or Location (Bus)
 * @property {boolean} [isLimited] - For buses, is it a Limited service?
 * @property {string} [tripId] - Unique Trip ID
 * @property {number|string} [occupancyStatus] - GTFS-RT occupancy status
 * @property {number} [occupancyPercentage] - Calculated percentage full
 * @property {number} [passengerCount] - Absolute passenger count
 * @property {number} [passengerCapacity] - Total vehicle capacity
 */

/**
 * @typedef {Object} VehiclePosition
 * @property {string} tripId
 * @property {number|string} [occupancyStatus]
 * @property {number} [occupancyPercentage]
 * @property {number} [passengerCount]
 * @property {number} [loadFactor]
 */

module.exports = {};
