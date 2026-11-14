import type {
  AirAlert,
  AlertRule,
  AqiCategoryInfo,
  MapMetricKey,
  PollutantKey,
  PollutantReadings,
  SensorStation,
} from '../types/aqi';

export const POLLUTANT_META: Record<
  PollutantKey,
  {
    name: string;
    formula: string;
    unit: string;
    whoGuideline: number;
    maxScale: number;
    description: string;
  }
> = {
  aqi: {
    name: 'Air Quality Index',
    formula: 'US EPA',
    unit: 'AQI',
    whoGuideline: 50,
    maxScale: 300,
    description: 'Composite index calibrated across primary airborne particulates and gases.',
  },
  pm25: {
    name: 'Fine Particulates',
    formula: 'PM₂.₅',
    unit: 'µg/m³',
    whoGuideline: 15,
    maxScale: 150,
    description: 'Inhalable combustion and aerosol particles smaller than 2.5 micrometers.',
  },
  pm10: {
    name: 'Coarse Particulates',
    formula: 'PM₁₀',
    unit: 'µg/m³',
    whoGuideline: 45,
    maxScale: 250,
    description: 'Dust, pollen, and suspended crustal particles up to 10 micrometers.',
  },
  o3: {
    name: 'Ground Ozone',
    formula: 'O₃',
    unit: 'µg/m³',
    whoGuideline: 100,
    maxScale: 240,
    description: 'Photochemical oxidant formed under sunlight from NOx and volatile organics.',
  },
  no2: {
    name: 'Nitrogen Dioxide',
    formula: 'NO₂',
    unit: 'µg/m³',
    whoGuideline: 25,
    maxScale: 200,
    description: 'Traffic and fossil-fuel emission marker linked to respiratory inflammation.',
  },
  so2: {
    name: 'Sulfur Dioxide',
    formula: 'SO₂',
    unit: 'µg/m³',
    whoGuideline: 40,
    maxScale: 150,
    description: 'Industrial and maritime fuel combustion byproduct.',
  },
  co: {
    name: 'Carbon Monoxide',
    formula: 'CO',
    unit: 'mg/m³',
    whoGuideline: 4,
    maxScale: 15,
    description: 'Colorless gas from incomplete combustion in dense transit corridors.',
  },
};

export function getAqiCategory(aqi: number): AqiCategoryInfo {
  const rounded = Math.max(0, Math.round(aqi));
  if (rounded <= 50) {
    return {
      severity: 'good',
      label: 'Good',
      shortLabel: 'Good',
      advisory: 'Air quality is crisp and clean. Ideal conditions for outdoor exercise and open ventilation.',
      rangeText: '0–50',
      accentHex: '#15803d',
      darkAccentHex: '#4ade80',
      textClass: 'text-emerald-700 dark:text-emerald-400',
      surfaceTintClass: 'bg-emerald-500/8 dark:bg-emerald-500/12',
      borderTintClass: 'border-emerald-600/25 dark:border-emerald-400/25',
      glyph: '●',
    };
  }
  if (rounded <= 100) {
    return {
      severity: 'moderate',
      label: 'Moderate',
      shortLabel: 'Moderate',
      advisory: 'Acceptable air quality overall. Unusually sensitive individuals should monitor prolonged exertion.',
      rangeText: '51–100',
      accentHex: '#b45309',
      darkAccentHex: '#fbbf24',
      textClass: 'text-amber-700 dark:text-amber-400',
      surfaceTintClass: 'bg-amber-500/8 dark:bg-amber-500/12',
      borderTintClass: 'border-amber-600/25 dark:border-amber-400/25',
      glyph: '◆',
    };
  }
  if (rounded <= 150) {
    return {
      severity: 'sensitive',
      label: 'Sensitive Groups',
      shortLabel: 'USG',
      advisory: 'Elevated particulates detected. Children, older adults, and respiratory-sensitive people should limit outdoor exertion.',
      rangeText: '101–150',
      accentHex: '#c2410c',
      darkAccentHex: '#fb923c',
      textClass: 'text-orange-700 dark:text-orange-400',
      surfaceTintClass: 'bg-orange-500/10 dark:bg-orange-500/14',
      borderTintClass: 'border-orange-600/30 dark:border-orange-400/30',
      glyph: '▲',
    };
  }
  if (rounded <= 200) {
    return {
      severity: 'unhealthy',
      label: 'Unhealthy',
      shortLabel: 'Unhealthy',
      advisory: 'Health effects possible for everyone. Move strenuous activities indoors and activate HEPA filtration.',
      rangeText: '151–200',
      accentHex: '#b91c1c',
      darkAccentHex: '#f87171',
      textClass: 'text-red-700 dark:text-red-400',
      surfaceTintClass: 'bg-red-500/10 dark:bg-red-500/15',
      borderTintClass: 'border-red-600/30 dark:border-red-400/30',
      glyph: '▲',
    };
  }
  if (rounded <= 300) {
    return {
      severity: 'very_unhealthy',
      label: 'Very Unhealthy',
      shortLabel: 'Very High',
      advisory: 'Health alert: significant respiratory risk across all groups. Keep windows sealed and wear N95 protection outdoors.',
      rangeText: '201–300',
      accentHex: '#7e22ce',
      darkAccentHex: '#c084fc',
      textClass: 'text-purple-700 dark:text-purple-400',
      surfaceTintClass: 'bg-purple-500/10 dark:bg-purple-500/15',
      borderTintClass: 'border-purple-600/30 dark:border-purple-400/30',
      glyph: '✖',
    };
  }
  return {
    severity: 'hazardous',
    label: 'Hazardous',
    shortLabel: 'Hazardous',
    advisory: 'Emergency air quality conditions. Avoid all outdoor exposure and run indoor air purification continuously.',
    rangeText: '301+',
    accentHex: '#881337',
    darkAccentHex: '#fb7185',
    textClass: 'text-rose-800 dark:text-rose-400',
    surfaceTintClass: 'bg-rose-600/12 dark:bg-rose-500/18',
    borderTintClass: 'border-rose-700/35 dark:border-rose-400/35',
    glyph: '✖',
  };
}

export function getMetricValue(readings: PollutantReadings, metric: MapMetricKey): number {
  return readings[metric];
}

/**
 * Normalizes a metric value onto a 0..1 heatmap intensity scale aligned with EPA health thresholds.
 */
export function normalizeMetricIntensity(value: number, metric: MapMetricKey): number {
  const scales: Record<MapMetricKey, number> = {
    aqi: 220,
    pm25: 110,
    pm10: 180,
    o3: 180,
    no2: 140,
  };
  const max = scales[metric] || 220;
  return Math.max(0, Math.min(1, value / max));
}

/**
 * Converts normalized 0..1 intensity into an RGBA color stop for smooth continuous heatmap rendering.
 */
export function intensityToRgba(t: number, alphaScale = 1): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  // Calibrated meteorological scale: Emerald -> Lime/Amber -> Orange -> Crimson -> Violet
  const stops: Array<{ p: number; r: number; g: number; b: number }> = [
    { p: 0.0, r: 16, g: 185, b: 129 },   // Emerald (Good)
    { p: 0.22, r: 132, g: 204, b: 22 },  // Chartreuse (Low-Moderate)
    { p: 0.42, r: 245, g: 158, b: 11 },  // Amber (Moderate)
    { p: 0.62, r: 249, g: 115, b: 22 },  // Orange (Sensitive)
    { p: 0.82, r: 220, g: 38, b: 38 },   // Crimson (Unhealthy)
    { p: 1.0, r: 147, g: 51, b: 234 },   // Violet (Very Unhealthy)
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].p && clamped <= stops[i + 1].p) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const span = upper.p - lower.p || 1;
  const f = (clamped - lower.p) / span;
  const r = Math.round(lower.r + (upper.r - lower.r) * f);
  const g = Math.round(lower.g + (upper.g - lower.g) * f);
  const b = Math.round(lower.b + (upper.b - lower.b) * f);
  const a = Math.round((0.36 + clamped * 0.42) * alphaScale * 255);
  return [r, g, b, Math.min(255, Math.max(0, a))];
}

/**
 * Inverse Distance Weighting (IDW) spatial interpolation at map coordinate (x, y).
 */
export function interpolateIdwValue(
  x: number,
  y: number,
  stations: SensorStation[],
  metric: MapMetricKey,
  power = 2.2
): number {
  if (stations.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;

  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const dx = x - s.x;
    const dy = y - s.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < 1) {
      return s.readings[metric];
    }

    const w = 1 / Math.pow(distSq, power / 2);
    weightedSum += w * s.readings[metric];
    weightTotal += w;
  }

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

export interface ProjectedStationPoint {
  px: number;
  py: number;
  value: number;
}

/**
 * Inverse Distance Weighting (IDW) interpolation in projected viewport pixel space
 * so the continuous heatmap aligns accurately over Leaflet map tiles at any zoom or region.
 */
export function interpolateIdwProjected(
  px: number,
  py: number,
  points: ProjectedStationPoint[],
  power = 2.2
): number {
  if (points.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dx = px - p.px;
    const dy = py - p.py;
    const distSq = dx * dx + dy * dy;

    if (distSq < 1) {
      return p.value;
    }

    const w = 1 / Math.pow(distSq, power / 2);
    weightedSum += w * p.value;
    weightTotal += w;
  }

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/**
 * Evaluates active alert rules against live sensor readings and returns newly triggered alerts
 * while respecting a cooldown window so repeated ticks do not spam duplicate entries.
 */
export function evaluateAlertRules(
  stations: SensorStation[],
  rules: AlertRule[],
  existingAlerts: AirAlert[],
  regionName: string,
  nowMs: number = Date.now(),
  cooldownMs: number = 90_000
): AirAlert[] {
  const newAlerts: AirAlert[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Find the highest-reading station that breaches this rule
    let peakStation: SensorStation | null = null;
    let peakValue = -Infinity;

    for (const station of stations) {
      const value = station.readings[rule.metric];
      if (value >= rule.threshold && value > peakValue) {
        peakValue = value;
        peakStation = station;
      }
    }

    if (!peakStation) continue;

    // Check cooldown against recent unacknowledged or recently fired alert for same rule+station
    const recentlyFired = existingAlerts.some((alert) => {
      if (alert.ruleId !== rule.id || alert.stationId !== peakStation!.id) return false;
      const alertTime = Date.parse(alert.timestamp);
      if (Number.isNaN(alertTime)) return false;
      return !alert.acknowledged || nowMs - alertTime < cooldownMs;
    });

    if (recentlyFired) continue;

    const meta = POLLUTANT_META[rule.metric];
    const cat = getAqiCategory(peakStation.readings.aqi);
    const formattedVal =
      rule.metric === 'aqi' ? Math.round(peakValue).toString() : peakValue.toFixed(1);

    newAlerts.push({
      id: `alert-${rule.id}-${peakStation.id}-${nowMs}`,
      ruleId: rule.id,
      stationId: peakStation.id,
      stationName: peakStation.name,
      regionName,
      metric: rule.metric,
      value: Number(formattedVal),
      threshold: rule.threshold,
      aqi: Math.round(peakStation.readings.aqi),
      severity: cat.severity,
      message: `${meta.formula} reached ${formattedVal} ${meta.unit} at ${peakStation.name} (threshold ${rule.threshold} ${meta.unit})`,
      timestamp: new Date(nowMs).toISOString(),
      acknowledged: false,
    });
  }

  return newAlerts;
}

export function formatRelativeTime(isoString: string, nowMs: number = Date.now()): string {
  const ts = Date.parse(isoString);
  if (Number.isNaN(ts)) return 'Just now';
  const diffSec = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}

export function playAlertChime(severity: string): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const isUrgent =
      severity === 'unhealthy' || severity === 'very_unhealthy' || severity === 'hazardous';

    const notes = isUrgent ? [587.33, 783.99, 880.0] : [523.25, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.26);
    });
  } catch {
    // Ignore audio context autoplay restrictions gracefully
  }
}

/**
 * Great-circle Haversine distance in kilometers between two WGS84 coordinates.
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes an 8-point compass bearing from (lat1, lon1) toward (lat2, lon2).
 */
export function compassBearing(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const deg = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Converts PM2.5 concentration (µg/m³) to US EPA AQI (0..500) using official breakpoints.
 */
export function pm25ToUsAqi(pm25: number): number {
  const c = Math.max(0, Math.floor(pm25 * 10) / 10);
  const breakpoints: Array<{ cLow: number; cHigh: number; iLow: number; iHigh: number }> = [
    { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
    { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 125.4, iLow: 151, iHigh: 200 },
    { cLow: 125.5, cHigh: 225.4, iLow: 201, iHigh: 300 },
    { cLow: 225.5, cHigh: 325.4, iLow: 301, iHigh: 400 },
    { cLow: 325.5, cHigh: 500.4, iLow: 401, iHigh: 500 },
  ];
  for (const bp of breakpoints) {
    if (c <= bp.cHigh) {
      return Math.round(((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (c - bp.cLow) + bp.iLow);
    }
  }
  return 500;
}

/**
 * Finds the nearest station to a given geographic coordinate with distance and compass bearing.
 */
export function findNearestStation(
  lat: number,
  lon: number,
  stations: SensorStation[]
): { station: SensorStation; distanceKm: number; bearing: string } | null {
  if (stations.length === 0) return null;

  let best = stations[0];
  let bestDist = haversineDistanceKm(lat, lon, best.lat, best.lon);

  for (let i = 1; i < stations.length; i++) {
    const candidate = stations[i];
    const dist = haversineDistanceKm(lat, lon, candidate.lat, candidate.lon);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }

  return {
    station: best,
    distanceKm: Number(bestDist.toFixed(1)),
    bearing: compassBearing(lat, lon, best.lat, best.lon),
  };
}

