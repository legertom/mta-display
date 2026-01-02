import { formatMinutes, formatOccupancy, getBusOccupancy, getSubwayOccupancyColor, formatDestinationArrival } from '../utils/formatters.js';

/**
 * Main Component: Arrival Card
 */
export function ArrivalCard(arrival) {
  const { route, minutes, destination, location, isLimited, occupancyStatus } = arrival;
  const timeDisplay = formatMinutes(minutes);
  const isArriving = minutes === 0;
  const isBus = !arrival.station;

  // Determine type for sub-renderers
  const routeType = isBus ? 'bus' : 'subway';

  return `
    <div class="arrival-item" data-route="${route}">
      <div class="arrival-info">
        
        ${renderRouteBadge(route, routeType, arrival.station)}
        
        <div class="arrival-details">
          ${renderLocation(arrival, isLimited)}
          ${renderDestination(arrival.destMinutes, arrival.destLabel, routeType)}
          ${renderSubwayBadge(occupancyStatus, routeType)}
          ${renderBusOccupancy(arrival, routeType)}
        </div>
      </div>

      <div class="arrival-time ${isArriving ? 'arriving' : 'minutes'}">
        ${timeDisplay}
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/*                               MICRO RENDERERS                              */
/* -------------------------------------------------------------------------- */

function renderRouteBadge(route, type, station) {
  if (type === 'bus') {
    return `<span class="route-badge bus">${route}</span>`;
  }
  const routeClass = station ? `subway-${route.toLowerCase()}` : '';
  return `<span class="route-badge ${routeClass}">${route}</span>`;
}

function renderLocation(arrival, isLimited) {
  const label = arrival.station || arrival.location || arrival.destination || 'Local';
  const ltdBadge = isLimited ? '<span class="route-badge limited">Ltd</span> ' : '';

  return `
    <div class="arrival-type">
        ${ltdBadge}${label}
    </div>`;
}

function renderDestination(minutes, label, type) {
  if (type === 'bus' || !minutes || !label) return '';
  // console.log('Rendering Dest:', type, minutes, label);

  const text = formatDestinationArrival(minutes, label);
  if (!text) return '';

  return `<div class="destination-eta">${text}</div>`;
}

function renderSubwayBadge(status, type) {
  if (type === 'bus' || !status) return '';

  const occupancy = formatOccupancy(status);
  if (!occupancy) return '';

  const style = getSubwayOccupancyColor(occupancy.color);

  return `
    <div class="arrival-occupancy">
        <span class="occupancy-badge" style="background-color: ${style.bg}; color: ${style.text}">
        ${occupancy.text}
        </span>
    </div>`;
}

function renderBusOccupancy(arrival, type) {
  if (type !== 'bus') return '';

  const busData = getBusOccupancy(arrival.passengerCount, arrival.passengerCapacity, arrival.occupancyStatus);
  if (!busData) return '';

  return `
    <div class="bus-occupancy">
        <div class="occupancy-bar">
            <div class="occupancy-fill" style="width: ${busData.percent}%; background: ${busData.barColor};"></div>
        </div>
        ${busData.label ? `<span class="occupancy-label">${busData.label}</span>` : ''}
    </div>`;
}
