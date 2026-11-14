import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { HourlyPoint } from '../types/aqi';
import { getAqiCategory } from '../utils/aqi';

interface TrajectoryChartProps {
  hourly: HourlyPoint[];
  regionName: string;
  isDark: boolean;
}

export function TrajectoryChart({ hourly, regionName, isDark }: TrajectoryChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    const W = 760;
    const H = 200;
    const padL = 38;
    const padR = 16;
    const padT = 18;
    const padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const values = hourly.map((p) => p.aqi);
    const maxVal = Math.max(120, Math.ceil(Math.max(...values, 60) / 25) * 25);
    const minVal = 0;

    const coords = hourly.map((pt, i) => {
      const x = padL + (i / Math.max(1, hourly.length - 1)) * innerW;
      const y = padT + (1 - (pt.aqi - minVal) / (maxVal - minVal)) * innerH;
      return { ...pt, x, y, idx: i };
    });

    const pastPoints = coords.filter((c) => !c.isForecast);
    const forecastPoints = coords.filter((c) => c.isForecast);
    const bridgeStart = pastPoints[pastPoints.length - 1];
    const forecastSeries = bridgeStart ? [bridgeStart, ...forecastPoints] : forecastPoints;

    const toPath = (pts: typeof coords) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    const areaPath =
      pastPoints.length > 1
        ? `${toPath(pastPoints)} L ${pastPoints[pastPoints.length - 1].x.toFixed(1)} ${
            padT + innerH
          } L ${pastPoints[0].x.toFixed(1)} ${padT + innerH} Z`
        : '';

    const thresholdY = padT + (1 - 100 / maxVal) * innerH;
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length));
    const peak = Math.max(...values);
    const min = Math.min(...values);

    return {
      W,
      H,
      padL,
      padT,
      innerW,
      innerH,
      maxVal,
      coords,
      pastPath: toPath(pastPoints),
      forecastPath: toPath(forecastSeries),
      areaPath,
      thresholdY,
      avg,
      peak,
      min,
      nowX: bridgeStart?.x ?? padL + innerW * 0.75,
    };
  }, [hourly]);

  const activePoint = hoveredIdx !== null ? chart.coords[hoveredIdx] : chart.coords[chart.coords.length - 7] || chart.coords[0];
  const activeCat = activePoint ? getAqiCategory(activePoint.aqi) : null;

  return (
    <section
      id="forecast"
      aria-label="24-hour AQI trajectory and forecast"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] p-5 transition-colors duration-300"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-display text-lg font-medium text-slate-900 dark:text-slate-100">
            24-Hour Trajectory &amp; Short-Term Forecast
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {regionName} · Hover timeline to inspect hourly PM₂.₅ and ozone shifts
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs font-mono-tabular">
          <div>
            <span className="text-slate-400 dark:text-slate-500 mr-1.5">Min</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{chart.min}</span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 mr-1.5">Avg</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{chart.avg}</span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 mr-1.5">Peak</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{chart.peak}</span>
          </div>
        </div>
      </div>

      {/* Interactive Hover Readout Strip */}
      <div className="mb-2 min-h-[24px] flex items-center justify-between text-xs font-mono-tabular">
        {activePoint && activeCat && (
          <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activePoint.timeLabel} {activePoint.isForecast ? '(Forecast)' : '(Observed)'}
            </span>
            <span className={activeCat.textClass}>
              {activeCat.glyph} {activePoint.aqi} AQI ({activeCat.shortLabel})
            </span>
            <span>PM₂.₅ {activePoint.pm25} µg/m³</span>
            <span>O₃ {activePoint.o3} µg/m³</span>
          </div>
        )}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chart.W} ${chart.H}`}
          className="w-full h-auto overflow-visible"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="aqi-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isDark ? '#38bdf8' : '#0284c7'} stopOpacity="0.24" />
              <stop offset="100%" stopColor={isDark ? '#38bdf8' : '#0284c7'} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Y gridlines */}
          {[0, 0.5, 1].map((frac) => {
            const val = Math.round(chart.maxVal * frac);
            const y = chart.padT + (1 - frac) * chart.innerH;
            return (
              <g key={frac}>
                <line
                  x1={chart.padL}
                  y1={y}
                  x2={chart.padL + chart.innerW}
                  y2={y}
                  stroke={isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)'}
                  strokeWidth="1"
                />
                <text
                  x={chart.padL - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  fill={isDark ? '#64748b' : '#94a3b8'}
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* EPA 100 AQI Advisory Threshold Line */}
          {chart.thresholdY >= chart.padT && (
            <g>
              <line
                x1={chart.padL}
                y1={chart.thresholdY}
                x2={chart.padL + chart.innerW}
                y2={chart.thresholdY}
                stroke={isDark ? 'rgba(251, 191, 36, 0.4)' : 'rgba(217, 119, 6, 0.45)'}
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={chart.padL + chart.innerW}
                y={chart.thresholdY - 5}
                textAnchor="end"
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
                fill={isDark ? '#fbbf24' : '#b45309'}
              >
                100 AQI threshold
              </text>
            </g>
          )}

          {/* Observed Area & Path */}
          {chart.areaPath && <path d={chart.areaPath} fill="url(#aqi-area-fill)" />}

          <motion.path
            key={`past-${regionName}`}
            d={chart.pastPath}
            fill="none"
            stroke={isDark ? '#38bdf8' : '#0284c7'}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Forecast Dashed Path */}
          {chart.forecastPath && (
            <motion.path
              key={`forecast-${regionName}`}
              d={chart.forecastPath}
              fill="none"
              stroke={isDark ? '#94a3b8' : '#64748b'}
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.3 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            />
          )}

          {/* Now Vertical Divider */}
          <line
            x1={chart.nowX}
            y1={chart.padT}
            x2={chart.nowX}
            y2={chart.padT + chart.innerH}
            stroke={isDark ? 'rgba(248, 250, 252, 0.2)' : 'rgba(15, 23, 42, 0.18)'}
            strokeWidth="1"
          />

          {/* X-axis Time Labels (every 4th point) */}
          {chart.coords.map((pt, i) => {
            if (i % 4 !== 0 && i !== chart.coords.length - 1) return null;
            return (
              <text
                key={pt.isoTime}
                x={pt.x}
                y={chart.H - 6}
                textAnchor="middle"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fill={isDark ? '#64748b' : '#94a3b8'}
              >
                {pt.timeLabel}
              </text>
            );
          })}

          {/* Active Crosshair & Point Highlight */}
          {activePoint && (
            <g className="pointer-events-none">
              <line
                x1={activePoint.x}
                y1={chart.padT}
                x2={activePoint.x}
                y2={chart.padT + chart.innerH}
                stroke={isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(2, 132, 199, 0.35)'}
                strokeWidth="1"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="4.5"
                fill={isDark ? '#38bdf8' : '#0284c7'}
                stroke={isDark ? '#090b10' : '#ffffff'}
                strokeWidth="2"
              />
            </g>
          )}

          {/* Invisible Interactive Hover Hit Columns */}
          {chart.coords.map((pt, i) => {
            const colW = chart.innerW / Math.max(1, chart.coords.length - 1);
            return (
              <rect
                key={`hit-${i}`}
                x={pt.x - colW / 2}
                y={chart.padT}
                width={colW}
                height={chart.innerH}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(i)}
              />
            );
          })}
        </svg>
      </div>
    </section>
  );
}
