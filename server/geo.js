const EARTH_RADIUS_M = 6371000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function haversineMeters(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const PRIORITY_VALUE = { low: 1, medium: 2, high: 3, critical: 4 };
const ACTIVE_STATUSES = new Set(['submitted', 'under_review', 'assigned', 'in_progress']);

export const CATEGORY_LABELS = {
  pothole: 'Pothole / Road Damage',
  road_damage: 'Road Damage',
  drainage: 'Drainage Blockage',
  drainage_blockage: 'Drainage Blockage',
  waterlogging: 'Waterlogging',
  garbage: 'Garbage Overflow',
  garbage_overflow: 'Garbage Overflow',
  streetlight: 'Broken Streetlight',
  broken_streetlight: 'Broken Streetlight',
  electrical_hazard: 'Electrical Hazard',
  other: 'Other',
};

const INSPECTION_ACTION = {
  drainage_blockage: 'Inspect and desilt the stormwater drain, verify the outfall, and camera-scan the line for structural collapse.',
  drainage: 'Inspect and desilt the stormwater drain, verify the outfall, and camera-scan the line for structural collapse.',
  waterlogging: 'Survey the drainage catchment, clear choke points, and check whether repeated flooding indicates an undersized drain.',
  pothole: 'Inspect the road base, not just the surface patch, and schedule hot-mix repair with proper edge sealing.',
  road_damage: 'Inspect the road base and kerb, then schedule structural repair rather than a cosmetic patch.',
  garbage_overflow: 'Audit collection frequency and bin capacity for the street, then adjust the route or add capacity.',
  garbage: 'Audit collection frequency and bin capacity for the street, then adjust the route or add capacity.',
  broken_streetlight: 'Check the feeder circuit and luminaire batch; a run of failures may indicate a cable fault rather than lamps.',
  streetlight: 'Check the feeder circuit and luminaire batch; a run of failures may indicate a cable fault rather than lamps.',
  electrical_hazard: 'Treat as an immediate safety inspection: isolate the circuit, verify earthing, and inspect the whole feeder.',
  other: 'Conduct a site inspection and classify the defect before assigning a work order.',
};

// Categories that share an underlying civic system. Two different complaints in
// the same family (for example a blocked drain and street waterlogging) are
// stronger evidence of an infrastructure defect than either category alone.
const CATEGORY_FAMILY = {
  drainage: 'drainage',
  drainage_blockage: 'drainage',
  waterlogging: 'drainage',
  pothole: 'roads',
  road_damage: 'roads',
  garbage: 'waste',
  garbage_overflow: 'waste',
  streetlight: 'electrical',
  broken_streetlight: 'electrical',
  electrical_hazard: 'electrical',
  other: 'other',
};

const INFRASTRUCTURE_FAMILY_COPY = {
  drainage: 'Repeated drainage and waterlogging reports in the same area may indicate a larger infrastructure problem, such as an undersized, silted or collapsed stormwater line, rather than separate blockages.',
  roads: 'Repeated pothole and road damage reports in the same area may indicate a structural failure of the road base rather than isolated surface defects.',
  waste: 'Repeated garbage reports in the same area may indicate a collection route or bin capacity problem rather than a one-off missed pickup.',
  electrical: 'Repeated streetlight and electrical reports in the same area may indicate a feeder or cabling fault rather than isolated lamp failures.',
};

function joinNatural(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function trendForDates(members, nowMs) {
  const recent = members.filter(c => {
    const t = Date.parse(c.createdAt);
    return Number.isFinite(t) && nowMs - t <= 14 * DAY_MS;
  }).length;
  const previous = members.filter(c => {
    const t = Date.parse(c.createdAt);
    return Number.isFinite(t) && nowMs - t > 14 * DAY_MS && nowMs - t <= 28 * DAY_MS;
  }).length;
  return {
    recent,
    previous,
    trend: recent > previous ? 'increasing' : recent < previous ? 'decreasing' : 'stable',
  };
}

function priorityFor(avgRank) {
  if (avgRank >= 3.5) return 'critical';
  if (avgRank >= 2.5) return 'high';
  if (avgRank >= 1.5) return 'medium';
  return 'low';
}

/**
 * DBSCAN over complaint coordinates using haversine distance.
 * @param {Array} points complaint rows with {lat,lng}
 * @param {number} epsMeters
 * @param {number} minPts
 */
export function dbscan(points, epsMeters = 400, minPts = 3) {
  const UNVISITED = -2;
  const NOISE = -1;
  const labels = new Array(points.length).fill(UNVISITED);
  let clusterId = 0;

  const neighbours = (index) => {
    const result = [];
    for (let i = 0; i < points.length; i += 1) {
      if (i === index) continue;
      if (haversineMeters(points[index], points[i]) <= epsMeters) result.push(i);
    }
    return result;
  };

  for (let i = 0; i < points.length; i += 1) {
    if (labels[i] !== UNVISITED) continue;
    const seeds = neighbours(i);
    if (seeds.length + 1 < minPts) {
      labels[i] = NOISE;
      continue;
    }
    labels[i] = clusterId;
    const queue = [...seeds];
    while (queue.length) {
      const current = queue.shift();
      if (labels[current] === NOISE) labels[current] = clusterId;
      if (labels[current] !== UNVISITED) continue;
      labels[current] = clusterId;
      const currentNeighbours = neighbours(current);
      if (currentNeighbours.length + 1 >= minPts) {
        for (const n of currentNeighbours) {
          if (labels[n] === UNVISITED || labels[n] === NOISE) queue.push(n);
        }
      }
    }
    clusterId += 1;
  }

  return { labels, clusterCount: clusterId };
}

/**
 * Build hotspot summaries from real complaint rows.
 *
 * Only active complaints (submitted, under review, assigned, in progress) are
 * clustered. Resolved, closed and rejected complaints remain on the map as
 * individual markers but do not inflate an active hotspot.
 *
 * Every number in the returned summary is derived from the member complaints:
 * centre, radius, category counts, average priority and submission dates.
 */
export function buildHotspots(complaints, { epsMeters = 400, minPts = 3, now = new Date() } = {}) {
  const membersSource = complaints.filter(c => ACTIVE_STATUSES.has(c.status));
  if (membersSource.length < minPts) return [];

  const points = membersSource.map(c => ({ lat: Number(c.location.lat), lng: Number(c.location.lng) }));
  const { labels, clusterCount } = dbscan(points, epsMeters, minPts);
  const nowMs = now.getTime();

  const hotspots = [];
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const members = membersSource.filter((_, index) => labels[index] === cluster);
    if (members.length < minPts) continue;

    const centerLat = members.reduce((sum, c) => sum + Number(c.location.lat), 0) / members.length;
    const centerLng = members.reduce((sum, c) => sum + Number(c.location.lng), 0) / members.length;
    const center = { lat: centerLat, lng: centerLng };
    const radiusMeters = Math.round(
      Math.max(...members.map(c => haversineMeters(center, { lat: Number(c.location.lat), lng: Number(c.location.lng) }))) + 75,
    );

    const categoryCounts = {};
    const wardCounts = {};
    const zoneCounts = {};
    for (const c of members) {
      categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
      wardCounts[c.location.ward] = (wardCounts[c.location.ward] || 0) + 1;
      zoneCounts[c.location.zone] = (zoneCounts[c.location.zone] || 0) + 1;
    }

    const categories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({
        category,
        label: CATEGORY_LABELS[category] || category,
        count,
        percentage: Number(((count / members.length) * 100).toFixed(1)),
      }));

    const [dominantCategory, dominantCount] = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])[0] || ['other', 0];

    const avgRank = members.reduce((sum, c) => sum + (PRIORITY_VALUE[c.priority] || 1), 0) / members.length;
    const severityRisk = avgRank >= 3.5 ? 'critical' : avgRank >= 2.5 ? 'high' : 'moderate';

    const ward = Object.entries(wardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || members[0].location.ward;
    const zone = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || members[0].location.zone;

    const reportTimes = members
      .map(c => Date.parse(c.createdAt))
      .filter(t => Number.isFinite(t))
      .sort((a, b) => a - b);
    const firstReportedAt = reportTimes.length ? new Date(reportTimes[0]).toISOString() : null;
    const lastReportedAt = reportTimes.length ? new Date(reportTimes[reportTimes.length - 1]).toISOString() : null;
    const avgAgeDays = reportTimes.length
      ? Number((reportTimes.reduce((sum, t) => sum + (nowMs - t), 0) / reportTimes.length / DAY_MS).toFixed(1))
      : null;
    const { recent, previous, trend } = trendForDates(members, nowMs);

    // Recurring categories (two or more reports in the same cluster).
    const recurring = categories.filter(c => c.count >= 2);
    const topThree = categories.slice(0, 3);
    const categoryText = joinNatural(topThree.map(c => `${c.count} ${c.label.toLowerCase()}`));
    const locationLabel = zone || ward || 'This area';

    // Group categories that share an infrastructure system, so that related
    // reports (for example drainage blockage + waterlogging) are recognised
    // even when no single category repeats often enough on its own.
    const familyCounts = {};
    for (const category of categories) {
      const family = CATEGORY_FAMILY[category.category] || 'other';
      familyCounts[family] = (familyCounts[family] || 0) + category.count;
    }
    const [dominantFamily, dominantFamilyCount] = Object.entries(familyCounts)
      .sort((a, b) => b[1] - a[1])[0] || ['other', 0];
    const familyCategories = categories.filter(c => (CATEGORY_FAMILY[c.category] || 'other') === dominantFamily);
    const familyIsMultiCategory = familyCategories.length >= 2;
    const infrastructureCopy = familyIsMultiCategory && dominantFamilyCount >= 2
      ? INFRASTRUCTURE_FAMILY_COPY[dominantFamily]
      : null;

    const insight = recurring.length >= 2
      ? `${locationLabel} has ${categoryText} reports concentrated within ${radiusMeters} m. The repeated ${joinNatural(
          recurring.slice(0, 2).map(c => c.label.toLowerCase()),
        )} pattern may indicate a larger underlying infrastructure problem rather than isolated incidents.`
      : infrastructureCopy
        ? `${locationLabel} has ${categoryText} reports concentrated within ${radiusMeters} m. ${infrastructureCopy}`
        : recurring.length === 1
          ? `${locationLabel} has ${categoryText} reports within ${radiusMeters} m. Repeated ${recurring[0].label.toLowerCase()} reports suggest a persistent local defect rather than a one-off incident.`
          : `${members.length} active complaints are concentrated within ${radiusMeters} m of this point. The dominant issue is ${CATEGORY_LABELS[dominantCategory] || dominantCategory}.`;

    const wardLabel = ward ? ward.replace(/^Ward \d+ - /, '') : 'Unassigned ward';

    hotspots.push({
      id: `hotspot-${cluster + 1}`,
      name: `Hotspot ${cluster + 1} — ${wardLabel}`,
      zone,
      ward,
      center: [Number(centerLat.toFixed(6)), Number(centerLng.toFixed(6))],
      radiusMeters,
      activeComplaintCount: members.length,
      dominantCategory,
      dominantCategoryCount: dominantCount,
      dominantCategories: categories.slice(0, 3),
      categories,
      severityRisk,
      avgPriority: priorityFor(avgRank),
      avgPriorityRank: Number(avgRank.toFixed(2)),
      avgPriorityScore: Math.round((avgRank / 4) * 100),
      recentComplaintCount: recent,
      previousComplaintCount: previous,
      firstReportedAt,
      lastReportedAt,
      avgAgeDays,
      aiAlertReason: insight,
      insight,
      suggestedInspectionAction: INSPECTION_ACTION[dominantCategory] || INSPECTION_ACTION.other,
      trend,
      complaintIds: members.map(c => c.id),
      complaintTickets: members.map(c => c.ticketNumber),
      generatedBy: 'DBSCAN (server-side, haversine distance)',
      params: { epsMeters, minPts },
    });
  }

  return hotspots.sort((a, b) => b.activeComplaintCount - a.activeComplaintCount);
}
