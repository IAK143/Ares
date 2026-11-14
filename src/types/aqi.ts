export type PollutantKey = 'aqi' | 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co';

export type MapMetricKey = 'aqi' | 'pm25' | 'pm10' | 'o3' | 'no2';

export type AqiSeverity =
  | 'good'
  | 'moderate'
  | 'sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous';

export interface AqiCategoryInfo {
  severity: AqiSeverity;
  label: string;
  shortLabel: string;
  advisory: string;
  rangeText: string;
  accentHex: string;
  darkAccentHex: string;
  textClass: string;
  surfaceTintClass: string;
  borderTintClass: string;
  glyph: string;
}

export interface PollutantReadings {
  aqi: number;
  pm25: number; // µg/m³
  pm10: number; // µg/m³
  o3: number; // µg/m³
  no2: number; // µg/m³
  so2: number; // µg/m³
  co: number; // mg/m³
}

export interface SensorStation {
  id: string;
  name: string;
  district: string;
  /** Normalized map position 0..1000 */
  x: number;
  /** Normalized map position 0..700 */
  y: number;
  lat: number;
  lon: number;
  elevationM: number;
  environmentType: 'Urban Core' | 'Coastal' | 'Industrial' | 'Highland' | 'Suburban';
  /** Relative spatial multiplier used when calibrating from regional telemetry */
  spatialBias: number;
  readings: PollutantReadings;
  updatedAt: string;
  trendDelta: number; // +/- AQI over last hour
  /** Optional geodesic distance in km from user's live location */
  distanceKm?: number;
  /** Optional sensor hardware or network provenance */
  sourceLabel?: string;
}

export interface ContourRing {
  elevationM: number;
  /** SVG path in 1000x700 coordinate space */
  path: string;
  labelPos?: { x: number; y: number };
}

export interface WaterFeature {
  name: string;
  path: string;
}

export interface RoadCorridor {
  name: string;
  path: string;
  major?: boolean;
}

export interface HourlyPoint {
  timeLabel: string;
  isoTime: string;
  aqi: number;
  pm25: number;
  o3: number;
  isForecast?: boolean;
}

export interface RegionDataset {
  id: string;
  name: string;
  country: string;
  centerLat: number;
  centerLon: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  temperatureC: number;
  humidityPct: number;
  waterFeatures: WaterFeature[];
  contours: ContourRing[];
  roads: RoadCorridor[];
  districtLabels: Array<{ name: string; x: number; y: number }>;
  stations: SensorStation[];
  hourly: HourlyPoint[];
}

export interface AlertRule {
  id: string;
  label: string;
  metric: MapMetricKey;
  threshold: number;
  enabled: boolean;
  notifyDesktop: boolean;
}

export interface AirAlert {
  id: string;
  ruleId: string;
  stationId: string;
  stationName: string;
  regionName: string;
  metric: MapMetricKey;
  value: number;
  threshold: number;
  aqi: number;
  severity: AqiSeverity;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export type MapBaseStyle = 'clean' | 'topo';

export interface MapLayerOptions {
  metric: MapMetricKey;
  baseStyle: MapBaseStyle;
  showContours: boolean;
  showWind: boolean;
  showLabels: boolean;
  heatmapOpacity: number;
}

export interface GeoLocationSuggestion {
  id: string;
  name: string;
  admin1?: string;
  country: string;
  lat: number;
  lon: number;
  elevationM?: number;
  population?: number;
}

export interface UserLocationContext {
  lat: number;
  lon: number;
  label: string;
  country: string;
  hasLocalMonitor: boolean;
  nearestStationId: string;
  nearestStationName: string;
  nearestDistanceKm: number;
  nearestBearing: string;
  localSearchRadiusKm: number;
}

