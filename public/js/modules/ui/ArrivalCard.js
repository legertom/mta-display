import { formatMinutes, formatOccupancy } from '../utils/formatters.js';

export function ArrivalCard(arrival) {
  const { route, minutes, destination, location, isLimited, occupancyStatus } = arrival;
  const timeDisplay = formatMinutes(minutes);
  const occupancy = formatOccupancy(occupancyStatus);
  const isArriving = minutes === 0;

  // CSS classes
  const routeClass = arrival.station ? `subway-${route.toLowerCase()}` : '';
  const isBus = !arrival.station;

  // Bus Occupancy Bar - Clean horizontal indicator
  let busOccupancyHtml = '';
  if (isBus && (arrival.passengerCapacity || occupancyStatus)) {
    let percent = 0;
    let label = '';

    if (arrival.passengerCapacity && arrival.passengerCount !== undefined) {
      percent = Math.min(100, Math.round((arrival.passengerCount / arrival.passengerCapacity) * 100));
      label = `${arrival.passengerCount}/${arrival.passengerCapacity}`;
    } else if (occupancyStatus) {
      const status = String(occupancyStatus).toLowerCase();
      if (status.includes('empty') || status.includes('many')) {
        percent = 20;
        label = 'Empty';
      } else if (status.includes('few')) {
        percent = 50;
        label = 'Seats';
      } else if (status.includes('standing')) {
        percent = 80;
        label = 'Standing';
      } else if (status.includes('full') || status.includes('crushed')) {
        percent = 100;
        label = 'Full';
      } else {
        percent = 30;
        label = '';
      }
    }

    // Color based on fill level
    let barColor = 'var(--status-low)';  // Green
    if (percent > 50) barColor = 'var(--status-medium)';  // Yellow
    if (percent > 80) barColor = 'var(--status-high)';  // Red

    busOccupancyHtml = `
      <div class="bus-occupancy">
        <div class="occupancy-bar">
          <div class="occupancy-fill" style="width: ${percent}%; background: ${barColor};"></div>
        </div>
        ${label ? `<span class="occupancy-label">${label}</span>` : ''}
      </div>
    `;
  }

  // Occupancy badge for subway only (not for buses)
  const occupancyBadgeHtml = (occupancy && !isBus)
    ? `<div class="arrival-occupancy">
         <span class="occupancy-badge" style="background-color: ${occupancy.color === 'green' ? '#d4edda' : occupancy.color === 'yellow' ? '#fff3cd' : '#f8d7da'}; color: ${occupancy.color === 'green' ? '#155724' : occupancy.color === 'yellow' ? '#856404' : '#721c24'}">
           ${occupancy.text}
         </span>
       </div>`
    : '';

  // Times Square display - show absolute arrival time (e.g., "Times Sq 1:37pm")
  let timesSquareHtml = '';
  if (!isBus && arrival.destMinutes) {
    const now = new Date();
    const arrivalTime = new Date(now.getTime() + arrival.destMinutes * 60000);
    const timeStr = arrivalTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).toLowerCase();
    timesSquareHtml = `<div class="times-square-eta">Times Sq ${timeStr}</div>`;
  }

  // HTML Construction
  return `
    <div class="arrival-item" data-route="${route}">
      <div class="arrival-info">
        <!-- Route Badge -->
        ${isBus
      ? `<span class="route-badge bus">${route}</span>`
      : `<span class="route-badge ${routeClass}">${route}</span>`
    }

        <div class="arrival-details">
          <!-- Station / Location -->
          <div class="arrival-type">
             ${isLimited ? '<span class="route-badge limited">Ltd</span> ' : ''}
             ${arrival.station || location || destination || 'Local'}
          </div>
          
          <!-- Times Square ETA (Subway only) -->
          ${timesSquareHtml}
          
          <!-- Occupancy Badge (Subway only) -->
          ${occupancyBadgeHtml}
          
          <!-- Bus Occupancy Bar -->
          ${busOccupancyHtml}
        </div>
      </div>

      <!-- Time -->
      <div class="arrival-time ${isArriving ? 'arriving' : 'minutes'}">
        ${timeDisplay}
      </div>
    </div>
  `;
}
