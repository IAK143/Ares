import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  Activity,
  Crosshair,
  Droplets,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Thermometer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  createDynamicRegionFromLocation,
  DEFAULT_ALERT_RULES,
  fetchLiveOpenMeteoCalibration,
  INITIAL_REGIONS,
  resolveLiveLocationRegion,
} from './data/regions';
import type {
  AirAlert,
  AlertRule,
  GeoLocationSuggestion,
  MapLayerOptions,
  RegionDataset,
  UserLocationContext,
} from './types/aqi';
import {
  evaluateAlertRules,
  getAqiCategory,
  playAlertChime,
} from './utils/aqi';
import { AnimatedNumber } from './components/AnimatedNumber';
import { TopBar, type NavSection } from './components/TopBar';
import { SensorHeatmapMap } from './components/SensorHeatmapMap';
import { PollutantBreakdown } from './components/PollutantBreakdown';
import { TrajectoryChart } from './components/TrajectoryChart';
import { AlertCenter } from './components/AlertCenter';
import { StationDirectory } from './components/StationDirectory';
import { AlertToastStack } from './components/AlertToastStack';
import { LocationSearch } from './components/LocationSearch';

const STORAGE_THEME_KEY = 'aeris-theme';
const STORAGE_RULES_KEY = 'aeris-alert-rules-v1';
const STORAGE_ALERTS_KEY = 'aeris-alert-history-v1';

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  const [regions, setRegions] = useState<RegionDataset[]>(INITIAL_REGIONS);
  const [activeRegionId, setActiveRegionId] = useState<string>(INITIAL_REGIONS[0].id);
  const [selectedStationByRegion, setSelectedStationByRegion] = useState<Record<string, string>>(() =>
    Object.fromEntries(INITIAL_REGIONS.map((r) => [r.id, r.stations[2]?.id ?? r.stations[0].id]))
  );

  const [layers, setLayers] = useState<MapLayerOptions>({
    metric: 'aqi',
    baseStyle: 'clean',
    showContours: true,
    showWind: true,
    showLabels: true,
    heatmapOpacity: 0.72,
  });

  const [rules, setRules] = useState<AlertRule[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_RULES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_ALERT_RULES;
  });

  const [alerts, setAlerts] = useState<AirAlert[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ALERTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [toasts, setToasts] = useState<AirAlert[]>([]);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLiveStream, setIsLiveStream] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [syncLabel, setSyncLabel] = useState<'Live API' | 'Calibrated Local'>('Calibrated Local');
  const [userLocation, setUserLocation] = useState<UserLocationContext | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'active' | 'denied' | 'unavailable'>('idle');
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [isDark]);

  // Persist rules & alerts
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_RULES_KEY, JSON.stringify(rules));
    } catch {
      // ignore
    }
  }, [rules]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ALERTS_KEY, JSON.stringify(alerts.slice(0, 40)));
    } catch {
      // ignore
    }
  }, [alerts]);

  const activeRegion = useMemo(
    () => regions.find((r) => r.id === activeRegionId) ?? regions[0],
    [regions, activeRegionId]
  );

  const selectedStation = useMemo(() => {
    const targetId = selectedStationByRegion[activeRegion.id];
    return activeRegion.stations.find((s) => s.id === targetId) ?? activeRegion.stations[0];
  }, [activeRegion, selectedStationByRegion]);

  // Dispatch newly triggered alerts to feed, toast queue, sound, and Web Notifications
  const dispatchAlerts = useCallback(
    (incoming: AirAlert[]) => {
      if (incoming.length === 0) return;
      setAlerts((prev) => [...incoming, ...prev].slice(0, 40));
      setToasts((prev) => [...incoming, ...prev].slice(0, 3));

      if (soundEnabledRef.current) {
        playAlertChime(incoming[0].severity);
      }

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const top = incoming[0];
        const ruleAllowsPush = rules.find((r) => r.id === top.ruleId)?.notifyDesktop ?? true;
        if (ruleAllowsPush) {
          try {
            new Notification(`Aeris Air Alert · ${top.stationName}`, {
              body: top.message,
              tag: top.ruleId,
            });
          } catch {
            // ignore notification errors in sandboxed iframes
          }
        }
      }
    },
    [rules]
  );

  // Evaluate rules whenever stations or rules change
  useEffect(() => {
    const triggered = evaluateAlertRules(
      activeRegion.stations,
      rules,
      alerts,
      activeRegion.name
    );
    if (triggered.length > 0) {
      dispatchAlerts(triggered);
    }
  }, [activeRegion.stations, activeRegion.name, rules, alerts, dispatchAlerts]);

  // Auto-dismiss toasts after 8 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(0, -1));
    }, 8000);
    return () => clearTimeout(timer);
  }, [toasts]);

  // Fetch live Open-Meteo telemetry for active region
  const syncActiveRegion = useCallback(async (targetRegion: RegionDataset) => {
    setIsSyncing(true);
    const { region: updated, liveSynced } = await fetchLiveOpenMeteoCalibration(targetRegion);
    setRegions((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSyncLabel(liveSynced ? 'Live API' : 'Calibrated Local');
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    void syncActiveRegion(activeRegion);
    // Sync when switching regions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegionId]);

  // Real-time micro-telemetry stream every 6 seconds
  useEffect(() => {
    if (!isLiveStream) return;
    const interval = setInterval(() => {
      const nowIso = new Date().toISOString();
      setRegions((prev) =>
        prev.map((reg) => {
          if (reg.id !== activeRegionId) return reg;
          return {
            ...reg,
            stations: reg.stations.map((st, idx) => {
              // Deterministic smooth atmospheric micro-drift
              const wave = Math.sin(Date.now() / 12000 + idx * 1.4) * 2.2;
              const nextAqi = Math.max(6, Math.round(st.readings.aqi + wave * 0.6));
              const ratio = st.readings.aqi > 0 ? nextAqi / st.readings.aqi : 1;
              return {
                ...st,
                updatedAt: nowIso,
                readings: {
                  ...st.readings,
                  aqi: nextAqi,
                  pm25: Number(Math.max(1.5, st.readings.pm25 * ratio).toFixed(1)),
                  pm10: Number(Math.max(4, st.readings.pm10 * ratio).toFixed(1)),
                  o3: Number(Math.max(12, st.readings.o3 + Math.cos(Date.now() / 15000 + idx) * 1.1).toFixed(1)),
                  no2: Number(Math.max(4, st.readings.no2 * ratio).toFixed(1)),
                },
              };
            }),
          };
        })
      );
    }, 6000);

    return () => clearInterval(interval);
  }, [isLiveStream, activeRegionId]);

  const handleUseLiveLocation = useCallback(
    async (silent = false) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setGeoStatus('unavailable');
        if (!silent) {
          setGeoMessage('Browser geolocation is unavailable on this device. Search any city instead.');
        }
        return;
      }

      setGeoStatus('locating');
      if (!silent) setGeoMessage(null);

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(4));
          const lon = Number(pos.coords.longitude.toFixed(4));

          try {
            const resolved = await resolveLiveLocationRegion(lat, lon);
            setRegions((prev) => {
              const withoutLive = prev.filter((r) => !r.id.startsWith('live-'));
              if (resolved.matchedPresetId) {
                return withoutLive.map((r) =>
                  r.id === resolved.matchedPresetId ? resolved.region : r
                );
              }
              return [resolved.region, ...withoutLive.filter((r) => !r.id.startsWith('custom-'))];
            });
            setSelectedStationByRegion((prev) => ({
              ...prev,
              [resolved.region.id]: resolved.userLocation.nearestStationId,
            }));
            setUserLocation(resolved.userLocation);
            setActiveRegionId(resolved.region.id);
            setGeoStatus('active');
            setGeoMessage(null);
            void syncActiveRegion(resolved.region);
          } catch {
            setGeoStatus('unavailable');
            if (!silent) {
              setGeoMessage('Could not resolve monitors near your coordinates. Try searching a city.');
            }
          }
        },
        (err) => {
          const denied = err?.code === 1;
          setGeoStatus(denied ? 'denied' : 'unavailable');
          if (!silent) {
            setGeoMessage(
              denied
                ? 'Live location permission was denied. Allow location access or search any city.'
                : 'Unable to acquire GPS fix right now. You can retry or search any city.'
            );
          }
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: silent ? 60_000 : 0 }
      );
    },
    [syncActiveRegion]
  );

  // Automatically resolve live location on startup when browser permission is available
  useEffect(() => {
    void handleUseLiveLocation(true);
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectSection = (sec: NavSection) => {
    setActiveSection(sec);
    const el = document.getElementById(sec);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSelectStation = (stationId: string) => {
    setSelectedStationByRegion((prev) => ({ ...prev, [activeRegion.id]: stationId }));
  };

  const handleSelectPresetRegion = (regionId: string) => {
    setUserLocation(null);
    setGeoMessage(null);
    setActiveRegionId(regionId);
  };

  const handleSelectSearchedLocation = (loc: GeoLocationSuggestion) => {
    setUserLocation(null);
    setGeoMessage(null);

    // Check if an existing preset matches closely
    const existingPreset = regions.find(
      (r) =>
        Math.abs(r.centerLat - loc.lat) < 0.08 && Math.abs(r.centerLon - loc.lon) < 0.08
    );
    if (existingPreset) {
      setActiveRegionId(existingPreset.id);
      void syncActiveRegion(existingPreset);
      return;
    }

    const dynamicRegion = createDynamicRegionFromLocation(loc);
    setRegions((prev) => {
      const filteredPresets = prev.filter((r) => !r.id.startsWith('custom-') && !r.id.startsWith('live-'));
      return [dynamicRegion, ...filteredPresets];
    });
    setSelectedStationByRegion((prev) => ({
      ...prev,
      [dynamicRegion.id]: dynamicRegion.stations[0].id,
    }));
    setActiveRegionId(dynamicRegion.id);
    void syncActiveRegion(dynamicRegion);
  };

  const handleInspectStationFromAlert = (stationId: string) => {
    handleSelectStation(stationId);
    const mapEl = document.getElementById('heatmap');
    if (mapEl) {
      mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleSimulateSpike = () => {
    const nowIso = new Date().toISOString();
    const targetStation = selectedStation;
    const spikedAqi = Math.max(158, targetStation.readings.aqi + 65);
    const spikedPm25 = Number(Math.max(68.4, targetStation.readings.pm25 + 32).toFixed(1));

    setRegions((prev) =>
      prev.map((reg) => {
        if (reg.id !== activeRegion.id) return reg;
        return {
          ...reg,
          stations: reg.stations.map((st) =>
            st.id === targetStation.id
              ? {
                  ...st,
                  updatedAt: nowIso,
                  trendDelta: 24,
                  readings: {
                    ...st.readings,
                    aqi: spikedAqi,
                    pm25: spikedPm25,
                    pm10: Number((spikedPm25 * 1.75).toFixed(1)),
                  },
                }
              : st
          ),
        };
      })
    );

    const simulatedAlert: AirAlert = {
      id: `sim-${Date.now()}`,
      ruleId: rules[0]?.id ?? 'sim',
      stationId: targetStation.id,
      stationName: targetStation.name,
      regionName: activeRegion.name,
      metric: 'aqi',
      value: spikedAqi,
      threshold: rules[0]?.threshold ?? 100,
      aqi: spikedAqi,
      severity: getAqiCategory(spikedAqi).severity,
      message: `Simulated particulate plume: ${spikedAqi} AQI (PM₂.₅ ${spikedPm25} µg/m³) at ${targetStation.name}.`,
      timestamp: nowIso,
      acknowledged: false,
    };
    dispatchAlerts([simulatedAlert]);
  };

  const handleRequestDesktopPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setDesktopPermission('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setDesktopPermission(result);
    } catch {
      setDesktopPermission('denied');
    }
  };

  const stationCategory = getAqiCategory(selectedStation.readings.aqi);
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  // Basin summary metrics
  const basinAvgAqi = Math.round(
    activeRegion.stations.reduce((sum, s) => sum + s.readings.aqi, 0) / activeRegion.stations.length
  );
  const basinPeakStation = activeRegion.stations.reduce((best, cur) =>
    cur.readings.aqi > best.readings.aqi ? cur : best
  );

  // Needle position along 0..300 EPA AQI bar
  const needlePct = Math.max(2, Math.min(98, (selectedStation.readings.aqi / 300) * 100));

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#090b10] text-slate-900 dark:text-slate-100 transition-colors duration-300">
        <TopBar
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
          isDark={isDark}
          onToggleDark={() => setIsDark((d) => !d)}
          unacknowledgedCount={unacknowledgedCount}
        />

        <main id="overview" className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
          {/* Workspace Toolbar: Live Location, Geocoding Search & Region Switcher */}
          <div className="space-y-2.5 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <LocationSearch
                  onSelectLocation={handleSelectSearchedLocation}
                  onRequestLiveLocation={() => void handleUseLiveLocation(false)}
                  geoLocating={geoStatus === 'locating'}
                />

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => void handleUseLiveLocation(false)}
                  disabled={geoStatus === 'locating'}
                  aria-pressed={Boolean(userLocation)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                    userLocation
                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {geoStatus === 'locating' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  ) : (
                    <Crosshair className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  )}
                  <span>
                    {geoStatus === 'locating'
                      ? 'Locating...'
                      : userLocation
                        ? `Live: ${userLocation.label.split(',')[0]}`
                        : 'Use Live Location'}
                  </span>
                </motion.button>

                <div
                  role="group"
                  aria-label="Monitoring regions"
                  className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/60 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                >
                  {regions.map((reg) => {
                    const isActive = reg.id === activeRegion.id;
                    return (
                      <button
                        key={reg.id}
                        type="button"
                        onClick={() => handleSelectPresetRegion(reg.id)}
                        aria-pressed={isActive}
                        className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                          isActive
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="region-switcher-pill"
                            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                            className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs border border-slate-200/80 dark:border-slate-700"
                          />
                        )}
                        <span className="relative z-10">{reg.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setIsLiveStream((v) => !v)}
                  aria-pressed={isLiveStream}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Activity
                    className={`w-3.5 h-3.5 ${
                      isLiveStream ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{isLiveStream ? 'Live Stream Active' : 'Stream Paused'}</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => void syncActiveRegion(activeRegion)}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{isSyncing ? 'Syncing...' : `Sync (${syncLabel})`}</span>
                </motion.button>
              </div>
            </div>

            {geoMessage && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/8 text-xs text-amber-800 dark:text-amber-300">
                <span>{geoMessage}</span>
                <button
                  type="button"
                  onClick={() => setGeoMessage(null)}
                  className="font-medium underline cursor-pointer shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* Primary Asymmetric Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Primary Column (7 cols) */}
            <div className="xl:col-span-7 space-y-6">
              {/* Editorial Hero Station Readout */}
              <motion.section
                layout
                aria-label="Selected station air quality summary"
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] p-5 sm:p-6 transition-colors duration-300"
              >
                {userLocation && (
                  <div
                    data-testid="live-location-banner"
                    className={`mb-4 px-3.5 py-2.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                      userLocation.hasLocalMonitor
                        ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-900 dark:text-emerald-200'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      {userLocation.hasLocalMonitor ? (
                        <span>
                          Live location <strong>{userLocation.label}</strong> · Connected to local monitor{' '}
                          <strong>{userLocation.nearestStationName}</strong>{' '}
                          <span className="font-mono-tabular">
                            ({userLocation.nearestDistanceKm} km {userLocation.nearestBearing})
                          </span>
                        </span>
                      ) : (
                        <span>
                          No air quality monitor at <strong>{userLocation.label}</strong>{' '}
                          <span className="font-mono-tabular">
                            ({userLocation.lat.toFixed(2)}°, {userLocation.lon.toFixed(2)}°)
                          </span>{' '}
                          — showing nearest station:{' '}
                          <strong>{userLocation.nearestStationName}</strong>{' '}
                          <span className="font-mono-tabular">
                            ({userLocation.nearestDistanceKm} km {userLocation.nearestBearing})
                          </span>
                        </span>
                      )}
                    </div>

                    {selectedStation.id !== userLocation.nearestStationId && (
                      <button
                        type="button"
                        onClick={() => handleSelectStation(userLocation.nearestStationId)}
                        className="font-medium underline shrink-0 cursor-pointer"
                      >
                        Switch to Nearest
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                  <div className="space-y-2 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{activeRegion.name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedStation.district}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{selectedStation.elevationM}m elev</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedStation.sourceLabel ?? selectedStation.environmentType}</span>
                    </div>

                    <AnimatePresence mode="wait">
                      <motion.h1
                        key={selectedStation.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-slate-900 dark:text-slate-50 text-balance"
                      >
                        {selectedStation.name}
                      </motion.h1>
                    </AnimatePresence>

                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                      {stationCategory.advisory}
                    </p>
                  </div>

                  {/* Hero Numeric AQI Readout */}
                  <div className="shrink-0 flex md:flex-col items-baseline md:items-end justify-between gap-2 md:text-right">
                    <div className="flex items-baseline gap-2">
                      <AnimatedNumber
                        value={selectedStation.readings.aqi}
                        className="text-5xl sm:text-6xl font-semibold tracking-tight text-slate-900 dark:text-slate-50"
                      />
                      <span className="text-xs font-mono-tabular uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        US AQI
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 text-sm font-medium">
                      <span className={stationCategory.textClass}>
                        {stationCategory.glyph} {stationCategory.label}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                        {selectedStation.trendDelta >= 0 ? (
                          <TrendingUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        )}
                        {selectedStation.trendDelta >= 0
                          ? `+${selectedStation.trendDelta}`
                          : selectedStation.trendDelta}
                        /hr
                      </span>
                    </div>
                  </div>
                </div>

                {/* EPA Continuum Bar with Animated Needle */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="relative h-2 rounded-full overflow-visible bg-slate-100 dark:bg-slate-800">
                    <div
                      className="absolute inset-0 rounded-full opacity-90"
                      style={{
                        background:
                          'linear-gradient(90deg, #10b981 0%, #f59e0b 28%, #f97316 48%, #dc2626 68%, #9333ea 100%)',
                      }}
                    />
                    <motion.div
                      animate={{ left: `${needlePct}%` }}
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white dark:bg-slate-950 border-2 border-slate-900 dark:border-white shadow-sm"
                    />
                  </div>

                  {/* Atmospheric Context Strip */}
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <Thermometer className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      <span>Temp</span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        {activeRegion.temperatureC}°C
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <Droplets className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      <span>Humidity</span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        {activeRegion.humidityPct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <Navigation
                        className="w-3.5 h-3.5 text-slate-400 shrink-0"
                        style={{ transform: `rotate(${activeRegion.windDirectionDeg}deg)` }}
                        aria-hidden="true"
                      />
                      <span>Wind</span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        {activeRegion.windSpeedKmh} km/h
                      </span>
                    </div>
                    <div
                      title={`Basin Peak: ${basinPeakStation.readings.aqi} AQI at ${basinPeakStation.name}`}
                      className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 whitespace-nowrap"
                    >
                      <span>Basin Avg</span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        {basinAvgAqi} AQI
                      </span>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Interactive Topographic Sensor Heatmap Map */}
              <SensorHeatmapMap
                region={activeRegion}
                selectedStationId={selectedStation.id}
                onSelectStation={handleSelectStation}
                layers={layers}
                onChangeLayers={setLayers}
                isDark={isDark}
                userLocation={userLocation}
              />

              {/* 24-Hour Trajectory & Forecast */}
              <TrajectoryChart
                hourly={activeRegion.hourly}
                regionName={activeRegion.name}
                isDark={isDark}
              />
            </div>

            {/* Right Secondary Column (5 cols) */}
            <div className="xl:col-span-5 space-y-6">
              {/* Real-Time Alert Feed & Custom Threshold Rules */}
              <AlertCenter
                alerts={alerts}
                rules={rules}
                desktopPermission={desktopPermission}
                soundEnabled={soundEnabled}
                onRequestDesktopPermission={() => void handleRequestDesktopPermission()}
                onToggleSound={() => setSoundEnabled((s) => !s)}
                onAcknowledgeAlert={(id) =>
                  setAlerts((prev) =>
                    prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
                  )
                }
                onAcknowledgeAll={() =>
                  setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })))
                }
                onToggleRule={(id) =>
                  setRules((prev) =>
                    prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
                  )
                }
                onUpdateThreshold={(id, nextThreshold) =>
                  setRules((prev) =>
                    prev.map((r) => (r.id === id ? { ...r, threshold: nextThreshold } : r))
                  )
                }
                onAddRule={(ruleInput) =>
                  setRules((prev) => [
                    ...prev,
                    { ...ruleInput, id: `rule-${Date.now()}` },
                  ])
                }
                onDeleteRule={(id) =>
                  setRules((prev) => prev.filter((r) => r.id !== id))
                }
                onInspectStation={handleInspectStationFromAlert}
                onSimulateSpike={handleSimulateSpike}
              />

              {/* Pollutant Breakdown */}
              <PollutantBreakdown
                station={selectedStation}
                activeMetric={layers.metric}
                onSelectMetric={(metric) => setLayers((prev) => ({ ...prev, metric }))}
              />

              {/* Sortable Station Directory */}
              <StationDirectory
                stations={activeRegion.stations}
                selectedStationId={selectedStation.id}
                onSelectStation={handleSelectStation}
                nearestStationId={userLocation?.nearestStationId ?? null}
              />
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-5 px-4 sm:px-8 mt-8">
          <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-display text-sm text-slate-700 dark:text-slate-300">
              Aeris Air Quality Observatory
            </span>
            <span>
              US EPA AQI Scale · Atmospheric telemetry calibrated via Open-Meteo &amp; topographic sensor interpolation
            </span>
          </div>
        </footer>

        <AlertToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
          onInspectStation={handleInspectStationFromAlert}
        />
      </div>
    </MotionConfig>
  );
}
