import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnimatePresence, motion } from 'motion/react';
import { Layers, LocateFixed, Map as MapIcon, Minus, Mountain, Plus, Wind } from 'lucide-react';
import type {
  MapLayerOptions,
  MapMetricKey,
  RegionDataset,
  SensorStation,
  UserLocationContext,
} from '../types/aqi';
import {
  getAqiCategory,
  intensityToRgba,
  interpolateIdwProjected,
  normalizeMetricIntensity,
  POLLUTANT_META,
  type ProjectedStationPoint,
} from '../utils/aqi';

interface SensorHeatmapMapProps {
  region: RegionDataset;
  selectedStationId: string;
  onSelectStation: (stationId: string) => void;
  layers: MapLayerOptions;
  onChangeLayers: (next: MapLayerOptions) => void;
  isDark: boolean;
  userLocation?: UserLocationContext | null;
}

const HEATMAP_GRID_W = 150;
const HEATMAP_GRID_H = 105;

const METRIC_OPTIONS: Array<{ id: MapMetricKey; label: string }> = [
  { id: 'aqi', label: 'US AQI' },
  { id: 'pm25', label: 'PM₂.₅' },
  { id: 'pm10', label: 'PM₁₀' },
  { id: 'o3', label: 'O₃' },
  { id: 'no2', label: 'NO₂' },
];

function getTileConfig(baseStyle: 'clean' | 'topo') {
  if (baseStyle === 'topo') {
    return {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: 'Map data: © OpenStreetMap contributors, SRTM | Style: © OpenTopoMap (CC-BY-SA)',
      maxZoom: 17,
      className: 'aeris-tiles-topo',
    };
  }
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    className: 'aeris-tiles-osm',
  };
}

export function SensorHeatmapMap({
  region,
  selectedStationId,
  onSelectStation,
  layers,
  onChangeLayers,
  isDark,
  userLocation = null,
}: SensorHeatmapMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [viewportSize, setViewportSize] = useState({ w: 800, h: 480 });
  const [stationPixels, setStationPixels] = useState<
    Array<{ station: SensorStation; px: number; py: number }>
  >([]);
  const [userPixel, setUserPixel] = useState<{ px: number; py: number } | null>(null);
  const [hoveredStationId, setHoveredStationId] = useState<string | null>(null);
  const [probe, setProbe] = useState<{
    lat: number;
    lon: number;
    value: number;
  } | null>(null);

  // Refs so Leaflet listeners always access fresh stations/layers without tearing down the map
  const regionRef = useRef(region);
  regionRef.current = region;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  // Project stations into container pixel coordinates and redraw IDW heatmap canvas
  const syncOverlayToMap = useCallback(() => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas) return;

    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) return;

    setViewportSize((prev) =>
      prev.w === size.x && prev.h === size.y ? prev : { w: size.x, h: size.y }
    );

    const curRegion = regionRef.current;
    const curLayers = layersRef.current;
    const curUser = userLocationRef.current;

    const projected = curRegion.stations.map((station) => {
      const pt = map.latLngToContainerPoint([station.lat, station.lon]);
      return { station, px: pt.x, py: pt.y };
    });

    setStationPixels(projected);

    if (curUser) {
      const uPt = map.latLngToContainerPoint([curUser.lat, curUser.lon]);
      setUserPixel({ px: uPt.x, py: uPt.y });
    } else {
      setUserPixel(null);
    }

    const idwPoints: ProjectedStationPoint[] = projected.map((p) => ({
      px: p.px,
      py: p.py,
      value: p.station.readings[curLayers.metric],
    }));

    if (canvas.width !== size.x || canvas.height !== size.y) {
      canvas.width = size.x;
      canvas.height = size.y;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = HEATMAP_GRID_W;
    offscreen.height = HEATMAP_GRID_H;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    const imgData = offCtx.createImageData(HEATMAP_GRID_W, HEATMAP_GRID_H);
    const data = imgData.data;

    for (let gy = 0; gy < HEATMAP_GRID_H; gy++) {
      const py = (gy / (HEATMAP_GRID_H - 1)) * size.y;
      for (let gx = 0; gx < HEATMAP_GRID_W; gx++) {
        const px = (gx / (HEATMAP_GRID_W - 1)) * size.x;
        const val = interpolateIdwProjected(px, py, idwPoints, 2.3);
        const intensity = normalizeMetricIntensity(val, curLayers.metric);
        const [r, g, b, a] = intensityToRgba(intensity, curLayers.heatmapOpacity);
        const idx = (gy * HEATMAP_GRID_W + gx) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      }
    }

    offCtx.putImageData(imgData, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, size.x, size.y);
  }, []);

  // Initialize Leaflet map once
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [region.centerLat, region.centerLon],
      zoom: 11,
      zoomControl: false,
      attributionControl: true,
    });

    const tileCfg = getTileConfig(layers.baseStyle);
    const tileLayer = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: tileCfg.maxZoom,
      className: tileCfg.className,
    }).addTo(map);

    mapRef.current = map;
    tileLayerRef.current = tileLayer;

    const handleRedraw = () => syncOverlayToMap();
    map.on('move', handleRedraw);
    map.on('zoom', handleRedraw);
    map.on('resize', handleRedraw);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const curStations = regionRef.current.stations;
      const curMetric = layersRef.current.metric;
      const projectedPts: ProjectedStationPoint[] = curStations.map((st) => {
        const p = map.latLngToContainerPoint([st.lat, st.lon]);
        return { px: p.x, py: p.y, value: st.readings[curMetric] };
      });
      const val = interpolateIdwProjected(
        e.containerPoint.x,
        e.containerPoint.y,
        projectedPts,
        2.3
      );
      setProbe({
        lat: Number(e.latlng.lat.toFixed(4)),
        lon: Number(e.latlng.lng.toFixed(4)),
        value: curMetric === 'aqi' ? Math.round(val) : Number(val.toFixed(1)),
      });
    });

    map.on('mouseout', () => setProbe(null));

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      syncOverlayToMap();
    });
    ro.observe(el);

    syncOverlayToMap();

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
    };
    // Mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap open-source tile layer when Dark Mode or Base Style ('clean' | 'topo') changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileCfg = getTileConfig(layers.baseStyle);
    const nextLayer = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: tileCfg.maxZoom,
      className: tileCfg.className,
    }).addTo(map);
    tileLayerRef.current = nextLayer;
  }, [layers.baseStyle]);

  // Smoothly fly/fit map when region or live user location changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const coords: [number, number][] = region.stations.map((s) => [s.lat, s.lon]);
    if (userLocation) {
      // Frame user's live location + nearest station clearly when no local monitor exists
      if (!userLocation.hasLocalMonitor) {
        const nearestSt = region.stations.find((s) => s.id === userLocation.nearestStationId);
        const focusCoords: [number, number][] = [[userLocation.lat, userLocation.lon]];
        if (nearestSt) {
          focusCoords.push([nearestSt.lat, nearestSt.lon]);
        }
        const focusBounds = L.latLngBounds(focusCoords);
        if (focusBounds.isValid()) {
          map.fitBounds(focusBounds, {
            paddingTopLeft: [64, 80],
            paddingBottomRight: [64, 115],
            maxZoom: 12,
            animate: true,
            duration: 0.6,
          });
          setProbe(null);
          return;
        }
      }
      coords.push([userLocation.lat, userLocation.lon]);
    }

    const bounds = L.latLngBounds(coords);
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        paddingTopLeft: [48, 56],
        paddingBottomRight: [48, 92],
        maxZoom: 12,
        animate: true,
        duration: 0.6,
      });
    } else {
      map.setView([region.centerLat, region.centerLon], 11, { animate: true });
    }
    setProbe(null);
  }, [region.id, region.centerLat, region.centerLon, userLocation?.lat, userLocation?.lon, userLocation?.nearestStationId, userLocation?.hasLocalMonitor]);

  // Redraw heatmap whenever station telemetry, active metric, or opacity updates
  useEffect(() => {
    syncOverlayToMap();
  }, [region.stations, layers.metric, layers.heatmapOpacity, userLocation, syncOverlayToMap]);

  const windVectors = useMemo(() => {
    const vectors: Array<{ x: number; y: number; delay: number }> = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        vectors.push({
          x: 80 + col * 150 + (row % 2) * 55,
          y: 75 + row * 115,
          delay: (row * 0.28 + col * 0.2) % 2.4,
        });
      }
    }
    return vectors;
  }, []);

  const windRad = ((region.windDirectionDeg - 90) * Math.PI) / 180;
  const windDx = Math.cos(windRad) * 26;
  const windDy = Math.sin(windRad) * 26;
  const metricMeta = POLLUTANT_META[layers.metric];

  const handleResetView = () => {
    const map = mapRef.current;
    if (!map) return;
    const coords: [number, number][] = region.stations.map((s) => [s.lat, s.lon]);
    if (userLocation) coords.push([userLocation.lat, userLocation.lon]);
    const bounds = L.latLngBounds(coords);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12, animate: true });
    }
  };

  const nearestPixelEntry = userLocation
    ? stationPixels.find((sp) => sp.station.id === userLocation.nearestStationId) ?? null
    : null;

  return (
    <section
      id="heatmap"
      aria-label="Interactive open-source sensor heatmap"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] overflow-hidden transition-colors duration-300"
    >
      {/* Map Header & Layer Bar */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="whitespace-nowrap">OpenStreetMap Telemetry</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular whitespace-nowrap">
              {region.stations.length} Georeferenced Sensors
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular whitespace-nowrap">
              Wind {region.windSpeedKmh} km/h
            </span>
          </div>
          <h2 className="font-display text-lg font-medium text-slate-900 dark:text-slate-100 mt-0.5">
            {region.name} Sensor Heatmap
          </h2>
        </div>

        {/* Metric Switcher */}
        <div
          role="group"
          aria-label="Heatmap pollutant layer"
          className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60"
        >
          {METRIC_OPTIONS.map((opt) => {
            const active = layers.metric === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeLayers({ ...layers, metric: opt.id })}
                aria-pressed={active}
                className={`relative px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  active
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="map-metric-active"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs border border-slate-200/80 dark:border-slate-700"
                  />
                )}
                <span className="relative z-10">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Base Cartography & Overlay Controls */}
      <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/70 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() =>
              onChangeLayers({
                ...layers,
                baseStyle: layers.baseStyle === 'clean' ? 'topo' : 'clean',
              })
            }
            aria-pressed={layers.baseStyle === 'topo'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              layers.baseStyle === 'topo'
                ? 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
                : 'border-slate-200/80 dark:border-slate-700/80 bg-white/70 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {layers.baseStyle === 'topo' ? (
              <Mountain className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{layers.baseStyle === 'topo' ? 'OpenTopoMap Contours' : 'OpenStreetMap'}</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => onChangeLayers({ ...layers, showWind: !layers.showWind })}
            aria-pressed={layers.showWind}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              layers.showWind
                ? 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Wind className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Wind Vectors</span>
          </motion.button>
        </div>

        <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400">
          <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          <label htmlFor="heatmap-opacity" className="whitespace-nowrap">
            Heat Density
          </label>
          <input
            id="heatmap-opacity"
            type="range"
            min={0.15}
            max={0.95}
            step={0.05}
            value={layers.heatmapOpacity}
            onChange={(e) =>
              onChangeLayers({ ...layers, heatmapOpacity: parseFloat(e.target.value) })
            }
            className="w-20 accent-sky-600 dark:accent-sky-400 cursor-pointer"
          />
          <span className="font-mono-tabular w-8 text-right">
            {Math.round(layers.heatmapOpacity * 100)}%
          </span>
        </div>
      </div>

      {/* Interactive Real Leaflet Map Stage */}
      <div className="relative w-full h-[430px] sm:h-[490px] overflow-hidden bg-slate-200 dark:bg-[#0b101b]">
        {/* Leaflet Tile Container */}
        <div
          ref={mapContainerRef}
          data-testid="leaflet-map"
          className="absolute inset-0 z-0"
        />

        {/* Continuous IDW Heatmap Overlay locked to Leaflet coordinates */}
        <canvas
          ref={canvasRef}
          data-testid="heatmap-canvas"
          className={`absolute inset-0 w-full h-full pointer-events-none z-[400] ${
            isDark && layers.baseStyle === 'clean'
              ? 'mix-blend-screen opacity-90'
              : 'mix-blend-multiply opacity-85'
          }`}
        />

        {/* Animated Wind Vectors Overlay */}
        {layers.showWind && (
          <svg
            viewBox={`0 0 ${viewportSize.w} ${viewportSize.h}`}
            className="absolute inset-0 w-full h-full pointer-events-none z-[410]"
            aria-hidden="true"
          >
            {windVectors.map((vec, i) => (
              <motion.g
                key={i}
                initial={{ opacity: 0.15, x: -windDx * 0.4, y: -windDy * 0.4 }}
                animate={{
                  opacity: [0.1, 0.55, 0.1],
                  x: [-windDx * 0.4, windDx * 0.6],
                  y: [-windDy * 0.4, windDy * 0.6],
                }}
                transition={{
                  duration: 3.4,
                  repeat: Infinity,
                  delay: vec.delay,
                  ease: 'linear',
                }}
              >
                <line
                  x1={vec.x}
                  y1={vec.y}
                  x2={vec.x + windDx}
                  y2={vec.y + windDy}
                  stroke={isDark ? 'rgba(226, 232, 240, 0.45)' : 'rgba(15, 23, 42, 0.35)'}
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
                <circle
                  cx={vec.x + windDx}
                  cy={vec.y + windDy}
                  r="1.7"
                  fill={isDark ? 'rgba(226, 232, 240, 0.55)' : 'rgba(15, 23, 42, 0.45)'}
                />
              </motion.g>
            ))}
          </svg>
        )}

        {/* Geodesic Connector from Live User Location to Nearest Station */}
        {userLocation && userPixel && nearestPixelEntry && (
          <svg
            viewBox={`0 0 ${viewportSize.w} ${viewportSize.h}`}
            className="absolute inset-0 w-full h-full pointer-events-none z-[440]"
            aria-hidden="true"
          >
            <line
              x1={userPixel.px}
              y1={userPixel.py}
              x2={nearestPixelEntry.px}
              y2={nearestPixelEntry.py}
              stroke={isDark ? '#38bdf8' : '#0284c7'}
              strokeWidth="2"
              strokeDasharray="6 5"
              strokeOpacity="0.9"
            />
          </svg>
        )}

        {/* Georeferenced Interactive Sensor Pins */}
        <div className="absolute inset-0 pointer-events-none z-[450]">
          {/* Pulsing Live User Location Marker */}
          {userLocation && userPixel && (
            <div
              data-testid="live-user-pin"
              style={{ left: `${userPixel.px}px`, top: `${userPixel.py}px` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none"
            >
              <span className="absolute -inset-2.5 rounded-full bg-sky-500/25 animate-ping" />
              <span className="relative flex items-center justify-center w-4 h-4 rounded-full bg-sky-600 dark:bg-sky-400 border-2 border-white dark:border-slate-950 shadow-md" />
              <div
                className={`absolute left-1/2 -translate-x-1/2 px-2 py-1 rounded-md border border-sky-200 dark:border-sky-800 bg-white/95 dark:bg-slate-900/95 shadow-sm whitespace-nowrap text-[10px] font-medium text-slate-900 dark:text-slate-100 ${
                  userPixel.py > viewportSize.h * 0.58 ? 'bottom-full mb-2' : 'top-full mt-2'
                }`}
              >
                <span>Live Location</span>
                {!userLocation.hasLocalMonitor && (
                  <span className="ml-1 font-mono-tabular text-sky-700 dark:text-sky-400">
                    · {userLocation.nearestDistanceKm} km to nearest
                  </span>
                )}
              </div>
            </div>
          )}

          {stationPixels.map(({ station, px, py }) => {
            if (px < -30 || py < -30 || px > viewportSize.w + 30 || py > viewportSize.h + 30) {
              return null;
            }
            const isSelected = station.id === selectedStationId;
            const isHovered = station.id === hoveredStationId;
            const value = station.readings[layers.metric];
            const cat = getAqiCategory(station.readings.aqi);
            const displayVal =
              layers.metric === 'aqi' ? Math.round(value).toString() : value.toFixed(0);

            return (
              <div
                key={station.id}
                style={{ left: `${px}px`, top: `${py}px` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto ${
                  isSelected || isHovered ? 'z-30' : 'z-10'
                }`}
              >
                {isSelected && (
                  <motion.span
                    layoutId="selected-sensor-ring"
                    transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                    className="absolute -inset-2 rounded-full border-2 border-slate-900 dark:border-white pointer-events-none"
                  />
                )}

                <motion.button
                  type="button"
                  onClick={() => onSelectStation(station.id)}
                  onMouseEnter={() => setHoveredStationId(station.id)}
                  onMouseLeave={() => setHoveredStationId(null)}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.92 }}
                  aria-label={`Select sensor ${station.name}, ${metricMeta.formula} ${displayVal} ${metricMeta.unit}`}
                  aria-pressed={isSelected}
                  style={{
                    borderColor: isDark ? cat.darkAccentHex : cat.accentHex,
                  }}
                  className={`relative flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full border-2 font-mono-tabular text-[11px] font-semibold transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                    isSelected
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-md z-20'
                      : 'bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 shadow-sm hover:z-20'
                  }`}
                >
                  {displayVal}
                </motion.button>

                <AnimatePresence>
                  {(isHovered || isSelected) && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 3, scale: 0.95 }}
                      transition={{ duration: 0.14 }}
                      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-md whitespace-nowrap z-30 ${
                        isSelected && !isHovered ? 'hidden sm:block' : 'block'
                      }`}
                    >
                      <div className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                        {station.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                        <span className={cat.textClass}>{cat.shortLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{station.readings.aqi} AQI</span>
                        <span aria-hidden="true">·</span>
                        <span>{station.elevationM}m</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Map Zoom Controls (Top Right) */}
        <div className="absolute top-3 right-3 z-[500] flex flex-col gap-1 p-1 rounded-lg border border-slate-200/90 dark:border-slate-700/90 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in map"
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out map"
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={handleResetView}
            aria-label="Fit basin sensors in map view"
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
          </motion.button>
        </div>

        {/* Live Crosshair Spatial Probe Readout (Bottom Left) */}
        <div className="absolute bottom-7 left-3 z-[500] pointer-events-none">
          <div className="px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-[11px] font-mono-tabular text-slate-700 dark:text-slate-300">
            {probe ? (
              <span>
                Interpolated {metricMeta.formula}: <strong>{probe.value}</strong> {metricMeta.unit} ·{' '}
                {probe.lat}°, {probe.lon}°
              </span>
            ) : (
              <span>
                Drag to pan · Scroll to zoom · Hover map for live {metricMeta.formula}
              </span>
            )}
          </div>
        </div>

        {/* Continuous Color Ramp Legend (Bottom Right above Leaflet attribution) */}
        <div className="absolute bottom-7 right-3 z-[500] hidden sm:block">
          <div className="px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 text-[10px] font-mono-tabular text-slate-600 dark:text-slate-300 mb-1">
              <span>Good</span>
              <span>Moderate</span>
              <span>Unhealthy</span>
              <span>High</span>
            </div>
            <div
              aria-hidden="true"
              className="w-44 h-2 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, #10b981 0%, #84cc16 22%, #f59e0b 42%, #f97316 62%, #dc2626 82%, #9333ea 100%)',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
