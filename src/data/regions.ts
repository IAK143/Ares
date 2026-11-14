import type {
  AlertRule,
  GeoLocationSuggestion,
  HourlyPoint,
  PollutantReadings,
  RegionDataset,
  SensorStation,
  UserLocationContext,
} from '../types/aqi';
import {
  compassBearing,
  findNearestStation,
  haversineDistanceKm,
  pm25ToUsAqi,
} from '../utils/aqi';

function buildHourlyCurve(baseAqi: number, peakOffset: number, phaseShift = 0): HourlyPoint[] {
  const points: HourlyPoint[] = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);

  for (let i = -18; i <= 5; i++) {
    const dt = new Date(now.getTime() + i * 3600_000);
    const hr = dt.getHours();
    const diurnal =
      Math.sin(((hr - 7 + phaseShift) / 24) * Math.PI * 2) * 0.22 +
      Math.cos(((hr - 16) / 12) * Math.PI) * 0.14;
    const aqi = Math.max(12, Math.round(baseAqi * (1 + diurnal) + (i > 0 ? peakOffset * (i / 5) : 0)));
    const pm25 = Number(Math.max(2.4, aqi * 0.34 + Math.sin(i * 0.7) * 1.6).toFixed(1));
    const o3 = Number(Math.max(18, 42 + Math.sin(((hr - 13) / 24) * Math.PI * 2) * 34 + aqi * 0.18).toFixed(1));

    const label = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    points.push({
      timeLabel: label,
      isoTime: dt.toISOString(),
      aqi,
      pm25,
      o3,
      isForecast: i > 0,
    });
  }
  return points;
}

function makeReadings(baseAqi: number, bias: number, elevM: number): PollutantReadings {
  const elevFactor = Math.max(0.76, 1 - elevM / 1200);
  const aqi = Math.max(8, Math.round(baseAqi * bias * elevFactor));
  const pm25 = Number(Math.max(2.1, aqi * 0.34 * bias).toFixed(1));
  const pm10 = Number(Math.max(5.5, pm25 * 1.78).toFixed(1));
  const o3 = Number(Math.max(18, 38 + (aqi * 0.42) / Math.max(0.85, bias)).toFixed(1));
  const no2 = Number(Math.max(6, aqi * 0.48 * bias).toFixed(1));
  const so2 = Number(Math.max(1.5, aqi * 0.11 * bias).toFixed(1));
  const co = Number(Math.max(0.2, 0.28 + (aqi / 180) * bias).toFixed(2));
  return { aqi, pm25, pm10, o3, no2, so2, co };
}

interface RealStationSpec {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
  elev: number;
  env: SensorStation['environmentType'];
  bias: number;
  trend: number;
}

function createRealStations(
  regionId: string,
  baseAqi: number,
  centerLat: number,
  centerLon: number,
  specs: RealStationSpec[]
): SensorStation[] {
  const nowIso = new Date().toISOString();
  return specs.map((s) => ({
    id: `${regionId}-${s.id}`,
    name: s.name,
    district: s.district,
    x: 500 + ((s.lon - centerLon) / 0.42) * 1000,
    y: 350 - ((s.lat - centerLat) / 0.28) * 700,
    lat: s.lat,
    lon: s.lon,
    elevationM: s.elev,
    environmentType: s.env,
    spatialBias: s.bias,
    readings: makeReadings(baseAqi, s.bias, s.elev),
    updatedAt: nowIso,
    trendDelta: s.trend,
    sourceLabel: 'Reference Network',
  }));
}

export const INITIAL_REGIONS: RegionDataset[] = [
  {
    id: 'sf-bay',
    name: 'San Francisco Bay',
    country: 'United States',
    centerLat: 37.7749,
    centerLon: -122.365,
    windSpeedKmh: 19,
    windDirectionDeg: 295,
    temperatureC: 16.4,
    humidityPct: 68,
    waterFeatures: [],
    contours: [],
    roads: [],
    districtLabels: [],
    stations: createRealStations('sf-bay', 48, 37.7749, -122.365, [
      { id: 'presidio', name: 'Presidio Headlands', district: 'North Coast', lat: 37.7989, lon: -122.4662, elev: 68, env: 'Coastal', bias: 0.65, trend: -3 },
      { id: 'embarcadero', name: 'Embarcadero Pier 27', district: 'Waterfront', lat: 37.8065, lon: -122.4018, elev: 8, env: 'Coastal', bias: 0.88, trend: 2 },
      { id: 'soma', name: 'SoMa Transit Hub', district: 'Downtown', lat: 37.7785, lon: -122.4056, elev: 14, env: 'Urban Core', bias: 1.15, trend: 4 },
      { id: 'twin-peaks', name: 'Twin Peaks Ridge', district: 'Central Heights', lat: 37.7544, lon: -122.4477, elev: 264, env: 'Highland', bias: 0.72, trend: -1 },
      { id: 'mission', name: 'Mission Dolores', district: 'Inner Basin', lat: 37.7596, lon: -122.4269, elev: 32, env: 'Urban Core', bias: 1.04, trend: 1 },
      { id: 'ocean-beach', name: 'Ocean Beach Dunes', district: 'Outer Sunset', lat: 37.7594, lon: -122.5107, elev: 11, env: 'Coastal', bias: 0.58, trend: -4 },
      { id: 'hunters-pt', name: 'Hunters Point', district: 'Southeast Bay', lat: 37.7294, lon: -122.3736, elev: 24, env: 'Industrial', bias: 1.28, trend: 6 },
      { id: 'oakland-port', name: 'Oakland Outer Harbor', district: 'East Bay Port', lat: 37.8091, lon: -122.3095, elev: 6, env: 'Industrial', bias: 1.62, trend: 11 },
      { id: 'emeryville', name: 'Emeryville Junction', district: 'Eastshore', lat: 37.8358, lon: -122.2905, elev: 16, env: 'Industrial', bias: 1.38, trend: 5 },
      { id: 'berkeley', name: 'Berkeley Crest', district: 'East Hills', lat: 37.8716, lon: -122.2488, elev: 245, env: 'Highland', bias: 0.78, trend: -2 },
      { id: 'fruitvale', name: 'Fruitvale Corridor', district: 'East Oakland', lat: 37.7748, lon: -122.2242, elev: 18, env: 'Urban Core', bias: 1.32, trend: 7 },
      { id: 'san-leandro', name: 'San Leandro Basin', district: 'South Eastshore', lat: 37.7249, lon: -122.1561, elev: 15, env: 'Suburban', bias: 1.18, trend: 3 },
      { id: 'burlingame', name: 'Burlingame Bayfront', district: 'Peninsula', lat: 37.5841, lon: -122.3459, elev: 9, env: 'Suburban', bias: 0.94, trend: 0 },
      { id: 'sausalito', name: 'Marin Headlands', district: 'Golden Gate', lat: 37.8323, lon: -122.4994, elev: 188, env: 'Highland', bias: 0.68, trend: -2 },
    ]),
    hourly: buildHourlyCurve(48, 8),
  },
  {
    id: 'tokyo-bay',
    name: 'Tokyo Bay Plain',
    country: 'Japan',
    centerLat: 35.665,
    centerLon: 139.735,
    windSpeedKmh: 14,
    windDirectionDeg: 165,
    temperatureC: 14.8,
    humidityPct: 59,
    waterFeatures: [],
    contours: [],
    roads: [],
    districtLabels: [],
    stations: createRealStations('tokyo-bay', 62, 35.665, 139.735, [
      { id: 'marunouchi', name: 'Marunouchi Central', district: 'Chiyoda', lat: 35.6812, lon: 139.7671, elev: 18, env: 'Urban Core', bias: 1.12, trend: 3 },
      { id: 'shinjuku', name: 'Shinjuku West', district: 'Shinjuku', lat: 35.6896, lon: 139.6917, elev: 38, env: 'Urban Core', bias: 1.18, trend: 5 },
      { id: 'shibuya', name: 'Shibuya Crossing', district: 'Shibuya', lat: 35.6595, lon: 139.7004, elev: 28, env: 'Urban Core', bias: 1.09, trend: 2 },
      { id: 'ueno', name: 'Ueno Park Station', district: 'Taito', lat: 35.7141, lon: 139.7741, elev: 22, env: 'Urban Core', bias: 1.04, trend: -1 },
      { id: 'koto', name: 'Koto Freight Terminal', district: 'Koto', lat: 35.6495, lon: 139.8172, elev: 4, env: 'Industrial', bias: 1.38, trend: 8 },
      { id: 'odaiba', name: 'Odaiba Marine', district: 'Minato Bay', lat: 35.6272, lon: 139.7765, elev: 5, env: 'Coastal', bias: 0.78, trend: -2 },
      { id: 'kawasaki', name: 'Kawasaki Industrial', district: 'Keihin Port', lat: 35.5308, lon: 139.7029, elev: 6, env: 'Industrial', bias: 1.54, trend: 12 },
      { id: 'haneda', name: 'Haneda Airfield', district: 'Ota Bay', lat: 35.5494, lon: 139.7798, elev: 4, env: 'Coastal', bias: 1.05, trend: 4 },
      { id: 'musashino', name: 'Musashino Plateau', district: 'Western Hills', lat: 35.7061, lon: 139.5661, elev: 62, env: 'Highland', bias: 0.72, trend: -3 },
      { id: 'setagaya', name: 'Setagaya Garden', district: 'Southwest', lat: 35.6466, lon: 139.6533, elev: 46, env: 'Suburban', bias: 0.88, trend: 0 },
      { id: 'adachi', name: 'Adachi North', district: 'Arakawa', lat: 35.775, lon: 139.8045, elev: 11, env: 'Suburban', bias: 1.14, trend: 3 },
      { id: 'funabashi', name: 'Funabashi Bayfront', district: 'Chiba Coast', lat: 35.6947, lon: 139.9826, elev: 9, env: 'Industrial', bias: 1.24, trend: 6 },
      { id: 'yokohama', name: 'Yokohama Harbor', district: 'South Bay', lat: 35.4537, lon: 139.638, elev: 12, env: 'Coastal', bias: 0.96, trend: 1 },
    ]),
    hourly: buildHourlyCurve(62, 12, 3),
  },
  {
    id: 'london-thames',
    name: 'London Thames Basin',
    country: 'United Kingdom',
    centerLat: 51.5072,
    centerLon: -0.1276,
    windSpeedKmh: 22,
    windDirectionDeg: 245,
    temperatureC: 11.2,
    humidityPct: 76,
    waterFeatures: [],
    contours: [],
    roads: [],
    districtLabels: [],
    stations: createRealStations('london-thames', 38, 51.5072, -0.1276, [
      { id: 'marylebone', name: 'Marylebone Road', district: 'Central West', lat: 51.5225, lon: -0.1546, elev: 28, env: 'Urban Core', bias: 1.38, trend: 4 },
      { id: 'westminster', name: 'Westminster Bridge', district: 'Central', lat: 51.5007, lon: -0.1219, elev: 14, env: 'Urban Core', bias: 1.12, trend: 1 },
      { id: 'city', name: 'Bishopsgate', district: 'City of London', lat: 51.5155, lon: -0.0815, elev: 21, env: 'Urban Core', bias: 1.24, trend: 3 },
      { id: 'hampstead', name: 'Hampstead Heath', district: 'North Ridge', lat: 51.5608, lon: -0.1636, elev: 134, env: 'Highland', bias: 0.62, trend: -3 },
      { id: 'canary', name: 'Canary Wharf Dock', district: 'Isle of Dogs', lat: 51.5054, lon: -0.0235, elev: 7, env: 'Urban Core', bias: 1.06, trend: 2 },
      { id: 'greenwich', name: 'Greenwich Observatory', district: 'Southeast', lat: 51.4769, lon: -0.0005, elev: 48, env: 'Suburban', bias: 0.85, trend: -1 },
      { id: 'heathrow', name: 'Heathrow Perimeter', district: 'West Basin', lat: 51.47, lon: -0.4543, elev: 25, env: 'Industrial', bias: 1.48, trend: 6 },
      { id: 'richmond', name: 'Richmond Park', district: 'Southwest', lat: 51.4412, lon: -0.2739, elev: 36, env: 'Suburban', bias: 0.66, trend: -2 },
      { id: 'stratford', name: 'Stratford Crossing', district: 'East London', lat: 51.5416, lon: -0.0034, elev: 15, env: 'Industrial', bias: 1.28, trend: 5 },
      { id: 'brixton', name: 'Brixton Hill', district: 'South London', lat: 51.4569, lon: -0.1195, elev: 38, env: 'Urban Core', bias: 1.15, trend: 2 },
      { id: 'croydon', name: 'Croydon Downs', district: 'Far South', lat: 51.3762, lon: -0.0982, elev: 96, env: 'Highland', bias: 0.74, trend: -1 },
      { id: 'barking', name: 'Barking Riverside', district: 'Lower Thames', lat: 51.5223, lon: 0.1112, elev: 6, env: 'Industrial', bias: 1.32, trend: 4 },
      { id: 'hammersmith', name: 'Hammersmith Flyover', district: 'West Thames', lat: 51.4912, lon: -0.2237, elev: 12, env: 'Urban Core', bias: 1.22, trend: 3 },
    ]),
    hourly: buildHourlyCurve(38, -4, 6),
  },
  {
    id: 'delhi-ncr',
    name: 'New Delhi NCR',
    country: 'India',
    centerLat: 28.6139,
    centerLon: 77.209,
    windSpeedKmh: 7,
    windDirectionDeg: 315,
    temperatureC: 21.6,
    humidityPct: 62,
    waterFeatures: [],
    contours: [],
    roads: [],
    districtLabels: [],
    stations: createRealStations('delhi-ncr', 142, 28.6139, 77.209, [
      { id: 'connaught', name: 'Connaught Mandir Marg', district: 'New Delhi', lat: 28.6315, lon: 77.2167, elev: 218, env: 'Urban Core', bias: 1.02, trend: 6 },
      { id: 'anand-vihar', name: 'Anand Vihar ISBT', district: 'East Delhi', lat: 28.6469, lon: 77.3164, elev: 204, env: 'Industrial', bias: 1.38, trend: 14 },
      { id: 'okhla', name: 'Okhla Phase II', district: 'South Industrial', lat: 28.5308, lon: 77.2713, elev: 209, env: 'Industrial', bias: 1.28, trend: 9 },
      { id: 'ridge', name: 'Central Ridge Forest', district: 'Ridge Reserve', lat: 28.618, lon: 77.175, elev: 262, env: 'Highland', bias: 0.78, trend: -4 },
      { id: 'rohini', name: 'Rohini Sector 16', district: 'Northwest', lat: 28.7325, lon: 77.1199, elev: 214, env: 'Suburban', bias: 1.15, trend: 5 },
      { id: 'dwarka', name: 'Dwarka Sector 8', district: 'Southwest', lat: 28.5708, lon: 77.0672, elev: 216, env: 'Suburban', bias: 0.96, trend: 2 },
      { id: 'punjabi-bagh', name: 'Punjabi Bagh', district: 'West Ring', lat: 28.6684, lon: 77.1167, elev: 215, env: 'Urban Core', bias: 1.18, trend: 7 },
      { id: 'ito', name: 'ITO Yamuna Bridge', district: 'Central East', lat: 28.6289, lon: 77.2414, elev: 202, env: 'Urban Core', bias: 1.24, trend: 8 },
      { id: 'noida', name: 'Noida Sector 62', district: 'East NCR', lat: 28.6279, lon: 77.3649, elev: 201, env: 'Urban Core', bias: 1.14, trend: 5 },
      { id: 'gurugram', name: 'Gurugram Cyber Hub', district: 'South NCR', lat: 28.495, lon: 77.0895, elev: 220, env: 'Urban Core', bias: 1.08, trend: 3 },
      { id: 'bawana', name: 'Bawana Industrial', district: 'Far North', lat: 28.7762, lon: 77.051, elev: 219, env: 'Industrial', bias: 1.34, trend: 11 },
      { id: 'lodhi', name: 'Lodhi Gardens', district: 'Lutyens', lat: 28.5918, lon: 77.2273, elev: 216, env: 'Suburban', bias: 0.88, trend: -1 },
      { id: 'wazirpur', name: 'Wazirpur Industrial', district: 'North Ring', lat: 28.6997, lon: 77.1654, elev: 213, env: 'Industrial', bias: 1.31, trend: 10 },
    ]),
    hourly: buildHourlyCurve(142, 18, 9),
  },
];

/**
 * Global network of physical EPA / EEA / CPCB / NIES / municipal reference monitoring observatories
 * used alongside live Sensor.Community hardware monitors to determine whether a monitor exists at
 * the user's live location and identify the nearest real monitoring station if none is local.
 */
export const GLOBAL_REFERENCE_STATIONS: SensorStation[] = createRealStations(
  'global-ref',
  54,
  0,
  0,
  [
    { id: 'san-jose', name: 'San Jose Knox Ave', district: 'South Bay, CA', lat: 37.3382, lon: -121.8863, elev: 26, env: 'Urban Core', bias: 1.05, trend: 2 },
    { id: 'sacramento', name: 'Sacramento Del Paso', district: 'Central Valley, CA', lat: 38.6138, lon: -121.368, elev: 14, env: 'Urban Core', bias: 1.12, trend: 4 },
    { id: 'los-angeles', name: 'LA North Main St', district: 'Downtown Basin, CA', lat: 34.0665, lon: -118.2268, elev: 92, env: 'Urban Core', bias: 1.24, trend: 5 },
    { id: 'seattle', name: 'Seattle Beacon Hill', district: 'Puget Sound, WA', lat: 47.5682, lon: -122.3086, elev: 98, env: 'Suburban', bias: 0.82, trend: -2 },
    { id: 'denver', name: 'Denver CAMP Station', district: 'Front Range, CO', lat: 39.7512, lon: -104.9876, elev: 1609, env: 'Highland', bias: 0.94, trend: 1 },
    { id: 'chicago', name: 'Chicago Com Ed Yard', district: 'Loop West, IL', lat: 41.855, lon: -87.665, elev: 181, env: 'Urban Core', bias: 1.08, trend: 3 },
    { id: 'nyc-queens', name: 'Queens College II', district: 'New York City, NY', lat: 40.7361, lon: -73.8215, elev: 28, env: 'Urban Core', bias: 1.04, trend: 2 },
    { id: 'boston', name: 'Boston Roxbury Hub', district: 'Greater Boston, MA', lat: 42.3295, lon: -71.0826, elev: 14, env: 'Urban Core', bias: 0.92, trend: -1 },
    { id: 'austin', name: 'Austin Audubon Lab', district: 'Central Texas, TX', lat: 30.3544, lon: -97.7611, elev: 215, env: 'Suburban', bias: 0.88, trend: 0 },
    { id: 'toronto', name: 'Toronto Downtown Bay', district: 'Ontario, Canada', lat: 43.6629, lon: -79.388, elev: 92, env: 'Urban Core', bias: 0.9, trend: 1 },
    { id: 'mexico-city', name: 'Merced Observatory', district: 'CDMX Valley, Mexico', lat: 19.4246, lon: -99.1196, elev: 2240, env: 'Highland', bias: 1.36, trend: 7 },
    { id: 'sao-paulo', name: 'Parque Dom Pedro II', district: 'São Paulo, Brazil', lat: -23.5448, lon: -46.6277, elev: 750, env: 'Urban Core', bias: 1.18, trend: 4 },
    { id: 'buenos-aires', name: 'Parque Centenario', district: 'Buenos Aires, Argentina', lat: -34.6064, lon: -58.4357, elev: 24, env: 'Urban Core', bias: 0.96, trend: 1 },
    { id: 'paris', name: 'Paris Les Halles', district: 'Île-de-France', lat: 48.8622, lon: 2.3446, elev: 36, env: 'Urban Core', bias: 1.06, trend: 2 },
    { id: 'berlin', name: 'Berlin Mitte Brückenstr', district: 'Berlin Basin, Germany', lat: 52.5136, lon: 13.4188, elev: 38, env: 'Urban Core', bias: 0.95, trend: 1 },
    { id: 'zurich', name: 'Zurich Kaserne NABEL', district: 'Limmat Valley, CH', lat: 47.3776, lon: 8.5305, elev: 410, env: 'Suburban', bias: 0.78, trend: -2 },
    { id: 'amsterdam', name: 'Amsterdam Vondelpark', district: 'North Holland, NL', lat: 52.3597, lon: 4.8662, elev: 3, env: 'Coastal', bias: 0.88, trend: 0 },
    { id: 'madrid', name: 'Madrid Escuelas Aguirre', district: 'Retiro, Spain', lat: 40.4216, lon: -3.6823, elev: 672, env: 'Highland', bias: 1.04, trend: 3 },
    { id: 'rome', name: 'Roma Villa Ada', district: 'Lazio Basin, Italy', lat: 41.933, lon: 12.507, elev: 52, env: 'Urban Core', bias: 1.02, trend: 2 },
    { id: 'cairo', name: 'Abbassiya Observatory', district: 'Cairo Delta, Egypt', lat: 30.0725, lon: 31.2889, elev: 32, env: 'Urban Core', bias: 1.46, trend: 8 },
    { id: 'johannesburg', name: 'Alexandra Station', district: 'Gauteng, South Africa', lat: -26.1033, lon: 28.0983, elev: 1580, env: 'Highland', bias: 1.15, trend: 3 },
    { id: 'dubai', name: 'Al Mushrif Observatory', district: 'Dubai Coast, UAE', lat: 25.2178, lon: 55.4481, elev: 18, env: 'Coastal', bias: 1.28, trend: 4 },
    { id: 'mumbai', name: 'Colaba Navy Nagar', district: 'South Mumbai, India', lat: 18.91, lon: 72.812, elev: 11, env: 'Coastal', bias: 1.24, trend: 5 },
    { id: 'bengaluru', name: 'BTM Layout CPCB', district: 'Bengaluru, India', lat: 12.9135, lon: 77.595, elev: 912, env: 'Highland', bias: 1.12, trend: 3 },
    { id: 'kolkata', name: 'Victoria Memorial CPCB', district: 'Central Kolkata, India', lat: 22.5448, lon: 88.3426, elev: 10, env: 'Urban Core', bias: 1.38, trend: 6 },
    { id: 'chennai', name: 'Alandur Bus Depot', district: 'South Chennai, India', lat: 12.997, lon: 80.1915, elev: 15, env: 'Coastal', bias: 1.1, trend: 2 },
    { id: 'singapore', name: 'Marina South NEA', district: 'Central Region, SG', lat: 1.2799, lon: 103.8639, elev: 8, env: 'Coastal', bias: 0.86, trend: 0 },
    { id: 'bangkok', name: 'Din Daeng PCD', district: 'Central Bangkok, TH', lat: 13.7627, lon: 100.5502, elev: 5, env: 'Urban Core', bias: 1.22, trend: 4 },
    { id: 'seoul', name: 'Jongno-gu Air Korea', district: 'Central Seoul, KR', lat: 37.572, lon: 127.005, elev: 44, env: 'Urban Core', bias: 1.06, trend: 2 },
    { id: 'beijing', name: 'Dongsi Environmental', district: 'Dongcheng, China', lat: 39.929, lon: 116.417, elev: 49, env: 'Urban Core', bias: 1.28, trend: 5 },
    { id: 'sydney', name: 'Rozelle Observatory', district: 'Inner West, NSW', lat: -33.8658, lon: 151.1627, elev: 24, env: 'Coastal', bias: 0.72, trend: -1 },
    { id: 'melbourne', name: 'Alphington EPA', district: 'Yarra Basin, VIC', lat: -37.7784, lon: 145.0306, elev: 46, env: 'Suburban', bias: 0.76, trend: 0 },
  ]
);

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'rule-aqi-unhealthy',
    label: 'Elevated Basin AQI',
    metric: 'aqi',
    threshold: 100,
    enabled: true,
    notifyDesktop: true,
  },
  {
    id: 'rule-pm25-who',
    label: 'Fine Particulate Spike',
    metric: 'pm25',
    threshold: 35,
    enabled: true,
    notifyDesktop: true,
  },
  {
    id: 'rule-o3-peak',
    label: 'Afternoon Ozone Peak',
    metric: 'o3',
    threshold: 120,
    enabled: true,
    notifyDesktop: false,
  },
];

/**
 * Searches real-world cities & locations via Open-Meteo Geocoding API as the user types,
 * falling back smoothly to matching built-in basins if offline.
 */
export async function searchLocationSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<GeoLocationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const localFallback: GeoLocationSuggestion[] = INITIAL_REGIONS.filter(
    (r) =>
      r.name.toLowerCase().includes(trimmed.toLowerCase()) ||
      r.country.toLowerCase().includes(trimmed.toLowerCase())
  ).map((r) => ({
    id: `preset-${r.id}`,
    name: r.name,
    country: r.country,
    lat: r.centerLat,
    lon: r.centerLon,
  }));

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      trimmed
    )}&count=6&language=en&format=json`;
    const res = await fetch(url, { signal });
    if (!res.ok) return localFallback;
    const data = await res.json();
    if (!Array.isArray(data?.results)) return localFallback;

    const results: GeoLocationSuggestion[] = data.results.map(
      (item: {
        id?: number;
        name: string;
        admin1?: string;
        country?: string;
        latitude: number;
        longitude: number;
        elevation?: number;
        population?: number;
      }) => ({
        id: `geo-${item.id ?? `${item.latitude.toFixed(3)}-${item.longitude.toFixed(3)}`}`,
        name: item.name,
        admin1: item.admin1,
        country: item.country || 'Earth',
        lat: Number(item.latitude.toFixed(4)),
        lon: Number(item.longitude.toFixed(4)),
        elevationM: typeof item.elevation === 'number' ? Math.round(item.elevation) : undefined,
        population: typeof item.population === 'number' ? item.population : undefined,
      })
    );

    return results.length > 0 ? results : localFallback;
  } catch {
    return localFallback;
  }
}

/**
 * Reverse-geocodes live GPS coordinates using Photon (OpenStreetMap, CORS-enabled).
 */
export async function reverseGeocodeLocation(
  lat: number,
  lon: number
): Promise<{ label: string; country: string }> {
  const fallback = {
    label: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
    country: 'Live GPS',
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return fallback;
    const data = await res.json();
    const props = data?.features?.[0]?.properties;
    if (!props) return fallback;

    const locality =
      props.city || props.town || props.village || props.locality || props.district || props.name;
    const stateOrCounty = props.state || props.county;
    const country = props.country || 'Earth';
    const label = locality
      ? stateOrCounty && stateOrCounty !== locality
        ? `${locality}, ${stateOrCounty}`
        : String(locality)
      : stateOrCounty || fallback.label;

    return { label, country };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Queries live public outdoor particulate hardware monitors from Sensor.Community within radiusKm.
 */
async function querySensorCommunityMonitors(
  userLat: number,
  userLon: number,
  radiusKm: number
): Promise<SensorStation[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const url =
      `https://data.sensor.community/airrohr/v1/filter/area=${userLat.toFixed(4)},${userLon.toFixed(4)},${radiusKm}` +
      `&type=SDS011,PMS5003,PMS7003,SPS30,SEN5X,HPM`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const items = await res.json();
    if (!Array.isArray(items)) return [];

    const nowIso = new Date().toISOString();
    const byLocationId = new Map<string, SensorStation>();

    for (const item of items) {
      const loc = item?.location;
      const values = Array.isArray(item?.sensordatavalues) ? item.sensordatavalues : [];
      if (!loc || loc.indoor === 1) continue;

      const sLat = parseFloat(loc.latitude);
      const sLon = parseFloat(loc.longitude);
      if (!Number.isFinite(sLat) || !Number.isFinite(sLon)) continue;

      let pm25: number | null = null;
      let pm10: number | null = null;
      for (const v of values) {
        if (v.value_type === 'P2') pm25 = parseFloat(v.value);
        if (v.value_type === 'P1') pm10 = parseFloat(v.value);
      }
      if (pm25 == null || !Number.isFinite(pm25) || pm25 < 0 || pm25 > 900) continue;

      const locKey = String(loc.id ?? `${sLat.toFixed(3)}-${sLon.toFixed(3)}`);
      if (byLocationId.has(locKey)) continue;

      const distKm = Number(haversineDistanceKm(userLat, userLon, sLat, sLon).toFixed(1));
      const aqi = pm25ToUsAqi(pm25);
      const elev = Number.isFinite(parseFloat(loc.altitude))
        ? Math.max(0, Math.round(parseFloat(loc.altitude)))
        : 25;
      const sensorModel = item?.sensor?.sensor_type?.name || 'Particulate Node';

      byLocationId.set(locKey, {
        id: `sc-${locKey}`,
        name: `${sensorModel} #${locKey}`,
        district: `${distKm} km ${compassBearing(userLat, userLon, sLat, sLon)}`,
        x: 500,
        y: 350,
        lat: Number(sLat.toFixed(4)),
        lon: Number(sLon.toFixed(4)),
        elevationM: elev,
        environmentType: 'Suburban',
        spatialBias: 1.0,
        readings: {
          aqi,
          pm25: Number(pm25.toFixed(1)),
          pm10: Number((pm10 != null && Number.isFinite(pm10) ? pm10 : pm25 * 1.65).toFixed(1)),
          o3: 48,
          no2: 18,
          so2: 4,
          co: 0.35,
        },
        updatedAt: nowIso,
        trendDelta: 0,
        distanceKm: distKm,
        sourceLabel: `Sensor.Community (${sensorModel})`,
      });
    }

    const sorted = Array.from(byLocationId.values()).sort(
      (a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999)
    );

    // Always keep #1 closest exact, then space remaining markers by >= 0.8 km for readable map pins
    const selected: SensorStation[] = [];
    for (const candidate of sorted) {
      if (selected.length === 0) {
        selected.push(candidate);
        continue;
      }
      if (selected.length >= 13) break;
      const tooClose = selected.some(
        (existing) => haversineDistanceKm(existing.lat, existing.lon, candidate.lat, candidate.lon) < 0.8
      );
      if (!tooClose) selected.push(candidate);
    }

    return selected;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export const LOCAL_MONITOR_RADIUS_KM = 10;

/**
 * Resolves the user's live GPS location against real physical monitors (Sensor.Community + global
 * reference network). If no monitor exists within 10 km of the user's position, switches to the
 * nearest available real monitoring station and preserves geodesic distance context.
 */
export async function resolveLiveLocationRegion(
  userLat: number,
  userLon: number
): Promise<{
  region: RegionDataset;
  userLocation: UserLocationContext;
  matchedPresetId: string | null;
}> {
  const [place, localHardware] = await Promise.all([
    reverseGeocodeLocation(userLat, userLon),
    querySensorCommunityMonitors(userLat, userLon, LOCAL_MONITOR_RADIUS_KM),
  ]);

  // If no hardware monitor within 10 km, widen hardware search to 120 km
  const regionalHardware =
    localHardware.length > 0
      ? localHardware
      : await querySensorCommunityMonitors(userLat, userLon, 120);

  // Collect all preset + global reference stations with distance from user
  const allPresetStations = INITIAL_REGIONS.flatMap((r) =>
    r.stations.map((s) => ({ regionId: r.id, station: s }))
  );

  const refWithDist = [
    ...allPresetStations.map((entry) => ({
      ...entry.station,
      presetId: entry.regionId,
      distanceKm: Number(haversineDistanceKm(userLat, userLon, entry.station.lat, entry.station.lon).toFixed(1)),
    })),
    ...GLOBAL_REFERENCE_STATIONS.map((s) => ({
      ...s,
      presetId: null as string | null,
      distanceKm: Number(haversineDistanceKm(userLat, userLon, s.lat, s.lon).toFixed(1)),
    })),
  ].sort((a, b) => a.distanceKm - b.distanceKm);

  const closestHardware = regionalHardware[0] ?? null;
  const closestRef = refWithDist[0];

  const hardwareIsCloser =
    closestHardware !== null &&
    (closestHardware.distanceKm ?? Infinity) <= closestRef.distanceKm;

  const nearestDist = hardwareIsCloser
    ? closestHardware!.distanceKm ?? 0
    : closestRef.distanceKm;
  const hasLocalMonitor = nearestDist <= LOCAL_MONITOR_RADIUS_KM;

  // Case 1: Closest reference observatory is part of an existing preset basin within 120 km
  // and no closer local Sensor.Community hardware node supersedes it
  if (!hardwareIsCloser && closestRef.presetId && closestRef.distanceKm <= 120) {
    const preset = INITIAL_REGIONS.find((r) => r.id === closestRef.presetId)!;
    const annotatedStations = preset.stations.map((st) => ({
      ...st,
      distanceKm: Number(haversineDistanceKm(userLat, userLon, st.lat, st.lon).toFixed(1)),
    }));
    const nearest = findNearestStation(userLat, userLon, annotatedStations)!;
    return {
      matchedPresetId: preset.id,
      region: {
        ...preset,
        stations: annotatedStations,
      },
      userLocation: {
        lat: userLat,
        lon: userLon,
        label: place.label,
        country: place.country,
        hasLocalMonitor,
        nearestStationId: nearest.station.id,
        nearestStationName: nearest.station.name,
        nearestDistanceKm: nearest.distanceKm,
        nearestBearing: nearest.bearing,
        localSearchRadiusKm: LOCAL_MONITOR_RADIUS_KM,
      },
    };
  }

  // Case 2: Build dynamic regional network anchored on nearest real monitors (hardware + nearby observatories)
  const combinedStations: SensorStation[] = [];
  for (const hw of regionalHardware) {
    combinedStations.push(hw);
  }
  for (const ref of refWithDist) {
    if (combinedStations.length >= 13) break;
    // Include nearest reference station always, plus regional neighbors within 600km (or top 4 closest globally)
    if (combinedStations.length < 4 || ref.distanceKm <= 600) {
      const { presetId: _unused, ...cleanStation } = ref;
      const duplicateCoord = combinedStations.some(
        (existing) => haversineDistanceKm(existing.lat, existing.lon, cleanStation.lat, cleanStation.lon) < 1.0
      );
      if (!duplicateCoord) {
        combinedStations.push(cleanStation);
      }
    }
  }

  // Ensure sorted nearest-first
  combinedStations.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  const primaryNearest = findNearestStation(userLat, userLon, combinedStations)!;

  const regionName = hasLocalMonitor
    ? place.label
    : `Nearest to ${place.label}`;

  const dynamicRegion: RegionDataset = {
    id: `live-${Math.round(Math.abs(userLat * 100))}-${Math.round(Math.abs(userLon * 100))}`,
    name: regionName,
    country: place.country,
    centerLat: primaryNearest.station.lat,
    centerLon: primaryNearest.station.lon,
    windSpeedKmh: 12,
    windDirectionDeg: 250,
    temperatureC: 18,
    humidityPct: 60,
    waterFeatures: [],
    contours: [],
    roads: [],
    districtLabels: [],
    stations: combinedStations,
    hourly: buildHourlyCurve(primaryNearest.station.readings.aqi, 4),
  };

  return {
    matchedPresetId: null,
    region: dynamicRegion,
    userLocation: {
      lat: userLat,
      lon: userLon,
      label: place.label,
      country: place.country,
      hasLocalMonitor,
      nearestStationId: primaryNearest.station.id,
      nearestStationName: primaryNearest.station.name,
      nearestDistanceKm: primaryNearest.distanceKm,
      nearestBearing: primaryNearest.bearing,
      localSearchRadiusKm: LOCAL_MONITOR_RADIUS_KM,
    },
  };
}

/**
 * Builds a geographically distributed 13-station monitoring network centered on any searched
 * real-world coordinate [lat, lon], ready for real-world Open-Meteo multi-point telemetry.
 */
export function createDynamicRegionFromLocation(loc: GeoLocationSuggestion): RegionDataset {
  const slug = loc.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const id = `custom-${slug}-${Math.round(Math.abs(loc.lat * 100))}`;
  const baseElev = loc.elevationM ?? 35;

  // Spatial offsets in degrees (~4km inner ring, ~11km outer basin)
  const cosLat = Math.max(0.35, Math.cos((loc.lat * Math.PI) / 180));
  const lonScale = 1 / cosLat;

  const nodes: Array<{
    id: string;
    name: string;
    district: string;
    dLat: number;
    dLon: number;
    env: SensorStation['environmentType'];
    bias: number;
    elevDelta: number;
  }> = [
    { id: 'central', name: `${loc.name} Central`, district: 'City Core', dLat: 0, dLon: 0, env: 'Urban Core', bias: 1.05, elevDelta: 0 },
    { id: 'inner-n', name: `${loc.name} North Core`, district: 'Inner North', dLat: 0.036, dLon: 0.008 * lonScale, env: 'Urban Core', bias: 1.08, elevDelta: 8 },
    { id: 'inner-e', name: `${loc.name} East Transit`, district: 'Inner East', dLat: -0.006, dLon: 0.042 * lonScale, env: 'Industrial', bias: 1.18, elevDelta: -6 },
    { id: 'inner-s', name: `${loc.name} South Hub`, district: 'Inner South', dLat: -0.038, dLon: -0.006 * lonScale, env: 'Urban Core', bias: 1.02, elevDelta: 4 },
    { id: 'inner-w', name: `${loc.name} West Park`, district: 'Inner West', dLat: 0.008, dLon: -0.042 * lonScale, env: 'Suburban', bias: 0.9, elevDelta: 16 },
    { id: 'outer-n', name: 'North Basin Ridge', district: 'Outer North', dLat: 0.095, dLon: -0.015 * lonScale, env: 'Highland', bias: 0.84, elevDelta: 48 },
    { id: 'outer-ne', name: 'Northeast Corridor', district: 'Outer NE', dLat: 0.072, dLon: 0.082 * lonScale, env: 'Industrial', bias: 1.2, elevDelta: -8 },
    { id: 'outer-e', name: 'East Industrial Belt', district: 'Outer East', dLat: -0.012, dLon: 0.112 * lonScale, env: 'Industrial', bias: 1.24, elevDelta: -10 },
    { id: 'outer-se', name: 'Southeast Valley', district: 'Outer SE', dLat: -0.078, dLon: 0.078 * lonScale, env: 'Suburban', bias: 1.04, elevDelta: 5 },
    { id: 'outer-s', name: 'South Gateway', district: 'Outer South', dLat: -0.102, dLon: 0.012 * lonScale, env: 'Suburban', bias: 0.96, elevDelta: 12 },
    { id: 'outer-sw', name: 'Southwest Greenbelt', district: 'Outer SW', dLat: -0.074, dLon: -0.086 * lonScale, env: 'Coastal', bias: 0.82, elevDelta: 22 },
    { id: 'outer-w', name: 'West Foothills', district: 'Outer West', dLat: 0.015, dLon: -0.108 * lonScale, env: 'Highland', bias: 0.8, elevDelta: 65 },
    { id: 'outer-nw', name: 'Northwest Heights', district: 'Outer NW', dLat: 0.076, dLon: -0.082 * lonScale, env: 'Highland', bias: 0.86, elevDelta: 42 },
  ];

  const nowIso = new Date().toISOString();
  const stations: SensorStation[] = nodes.map((n, idx) => {
    const lat = Number((loc.lat + n.dLat).toFixed(4));
    const lon = Number((loc.lon + n.dLon).toFixed(4));
    const elev = Math.max(2, Math.round(baseElev + n.elevDelta));
    return {
      id: `${id}-${n.id}`,
      name: n.name,
      district: n.district,
      x: 500 + ((lon - loc.lon) / 0.42) * 1000,
      y: 350 - ((lat - loc.lat) / 0.28) * 700,
      lat,
      lon,
      elevationM: elev,
      environmentType: n.env,
      spatialBias: n.bias,
      readings: makeReadings(46, n.bias, elev),
      updatedAt: nowIso,
      trendDelta: idx % 3 === 0 ? 3 : -1,
    };
  });

  return {
    id,
    name: loc.name,
    country: loc.admin1 ? `${loc.admin1}, ${loc.country}` : loc.country,
    centerLat: loc.lat,
    centerLon: loc.lon,
    windSpeedKmh: 12,
    windDirectionDeg: 250,
    temperatureC: 18,
    humidityPct: 60,
    waterFeatures: [],
    contours: [],
    roads: [],
    districtLabels: [],
    stations,
    hourly: buildHourlyCurve(46, 6),
  };
}

/**
 * Fetches real-world multi-coordinate Air Quality, Weather, and Elevation data from Open-Meteo
 * for ALL stations in a region simultaneously (no API key required).
 */
export async function fetchLiveOpenMeteoCalibration(
  region: RegionDataset
): Promise<{ region: RegionDataset; liveSynced: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const lats = region.stations.map((s) => s.lat.toFixed(4)).join(',');
    const lons = region.stations.map((s) => s.lon.toFixed(4)).join(',');

    const multiAqUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${lats}&longitude=${lons}` +
      `&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;

    const centerHourlyUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${region.centerLat}&longitude=${region.centerLon}` +
      `&hourly=us_aqi,pm2_5,ozone&past_hours=18&forecast_hours=6&timezone=auto`;

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${region.centerLat}&longitude=${region.centerLon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m`;

    const elevUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

    const [multiAqRes, centerHourlyRes, wRes, elevRes] = await Promise.all([
      fetch(multiAqUrl, { signal: controller.signal }),
      fetch(centerHourlyUrl, { signal: controller.signal }),
      fetch(weatherUrl, { signal: controller.signal }),
      fetch(elevUrl, { signal: controller.signal }).catch(() => null),
    ]);

    if (!multiAqRes.ok) {
      return { region, liveSynced: false };
    }

    const multiAqJson = await multiAqRes.json();
    const aqArray: Array<{ current?: Record<string, number> }> = Array.isArray(multiAqJson)
      ? multiAqJson
      : [multiAqJson];

    const centerHourlyJson = centerHourlyRes.ok ? await centerHourlyRes.json() : null;
    const wData = wRes.ok ? await wRes.json() : null;
    const elevData = elevRes && elevRes.ok ? await elevRes.json() : null;
    const elevations: number[] | null = Array.isArray(elevData?.elevation) ? elevData.elevation : null;

    const nowIso = new Date().toISOString();
    let anyLive = false;

    const calibratedStations: SensorStation[] = region.stations.map((station, idx) => {
      const point = aqArray[idx] ?? aqArray[0];
      const cur = point?.current;
      const realElev =
        elevations && typeof elevations[idx] === 'number'
          ? Math.max(0, Math.round(elevations[idx]))
          : station.elevationM;

      if (!cur || typeof cur.us_aqi !== 'number') {
        return { ...station, elevationM: realElev };
      }

      anyLive = true;
      const isLiveHardware = Boolean(station.sourceLabel?.startsWith('Sensor.Community'));

      // Preserve live Sensor.Community physical PM readings while enriching gases from Open-Meteo
      const microBias = 0.92 + (station.spatialBias - 1) * 0.25;
      const liveAqi = isLiveHardware
        ? station.readings.aqi
        : Math.max(5, Math.round(cur.us_aqi * microBias));
      const livePm25 = isLiveHardware
        ? station.readings.pm25
        : typeof cur.pm2_5 === 'number'
          ? Number(Math.max(1.0, cur.pm2_5 * microBias).toFixed(1))
          : Number((liveAqi * 0.34).toFixed(1));
      const livePm10 = isLiveHardware
        ? station.readings.pm10
        : typeof cur.pm10 === 'number'
          ? Number(Math.max(2.0, cur.pm10 * microBias).toFixed(1))
          : Number((livePm25 * 1.75).toFixed(1));
      const liveO3 =
        typeof cur.ozone === 'number' ? Number(Math.max(5, cur.ozone).toFixed(1)) : station.readings.o3;
      const liveNo2 =
        typeof cur.nitrogen_dioxide === 'number'
          ? Number(Math.max(2, cur.nitrogen_dioxide * microBias).toFixed(1))
          : station.readings.no2;
      const liveSo2 =
        typeof cur.sulphur_dioxide === 'number'
          ? Number(Math.max(0.5, cur.sulphur_dioxide).toFixed(1))
          : station.readings.so2;
      const liveCo =
        typeof cur.carbon_monoxide === 'number'
          ? Number(Math.max(0.1, cur.carbon_monoxide / 1000).toFixed(2))
          : station.readings.co;

      return {
        ...station,
        elevationM: realElev,
        updatedAt: nowIso,
        readings: {
          aqi: liveAqi,
          pm25: livePm25,
          pm10: livePm10,
          o3: liveO3,
          no2: liveNo2,
          so2: liveSo2,
          co: liveCo,
        },
      };
    });

    if (!anyLive) {
      return { region, liveSynced: false };
    }

    let hourly = region.hourly;
    if (centerHourlyJson?.hourly?.time && Array.isArray(centerHourlyJson.hourly.us_aqi)) {
      const times: string[] = centerHourlyJson.hourly.time;
      const aqis: Array<number | null> = centerHourlyJson.hourly.us_aqi;
      const pm25s: Array<number | null> = centerHourlyJson.hourly.pm2_5 || [];
      const o3s: Array<number | null> = centerHourlyJson.hourly.ozone || [];
      const nowMs = Date.now();

      const parsedHourly: HourlyPoint[] = times
        .map((t, i): HourlyPoint | null => {
          const dt = new Date(t);
          const aqiVal = aqis[i];
          if (aqiVal == null || Number.isNaN(dt.getTime())) return null;
          return {
            timeLabel: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            isoTime: dt.toISOString(),
            aqi: Math.round(aqiVal),
            pm25: Number((pm25s[i] ?? aqiVal * 0.34).toFixed(1)),
            o3: Number((o3s[i] ?? 48).toFixed(1)),
            isForecast: dt.getTime() > nowMs,
          };
        })
        .filter((p): p is HourlyPoint => p !== null);

      if (parsedHourly.length >= 12) {
        hourly = parsedHourly;
      }
    }

    const wCur = wData?.current;
    return {
      liveSynced: true,
      region: {
        ...region,
        temperatureC:
          typeof wCur?.temperature_2m === 'number' ? Number(wCur.temperature_2m.toFixed(1)) : region.temperatureC,
        humidityPct:
          typeof wCur?.relative_humidity_2m === 'number'
            ? Math.round(wCur.relative_humidity_2m)
            : region.humidityPct,
        windSpeedKmh:
          typeof wCur?.wind_speed_10m === 'number' ? Math.round(wCur.wind_speed_10m) : region.windSpeedKmh,
        windDirectionDeg:
          typeof wCur?.wind_direction_10m === 'number'
            ? Math.round(wCur.wind_direction_10m)
            : region.windDirectionDeg,
        stations: calibratedStations,
        hourly,
      },
    };
  } catch {
    return { region, liveSynced: false };
  } finally {
    clearTimeout(timeout);
  }
}

