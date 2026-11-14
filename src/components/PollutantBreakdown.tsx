import { motion } from 'motion/react';
import type { MapMetricKey, PollutantKey, SensorStation } from '../types/aqi';
import { POLLUTANT_META } from '../utils/aqi';
import { AnimatedNumber } from './AnimatedNumber';

interface PollutantBreakdownProps {
  station: SensorStation;
  activeMetric: MapMetricKey;
  onSelectMetric: (metric: MapMetricKey) => void;
}

const DISPLAY_POLLUTANTS: PollutantKey[] = ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co'];

export function PollutantBreakdown({
  station,
  activeMetric,
  onSelectMetric,
}: PollutantBreakdownProps) {
  return (
    <section
      aria-label="Pollutant concentration breakdown"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] p-5 transition-colors duration-300"
    >
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div>
          <h3 className="font-display text-lg font-medium text-slate-900 dark:text-slate-100">
            Particulate &amp; Gas Telemetry
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Click PM₂.₅, PM₁₀, O₃, or NO₂ to project onto the topographic heatmap
          </p>
        </div>
        <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400 whitespace-nowrap">
          WHO 24h ref
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DISPLAY_POLLUTANTS.map((key, index) => {
          const meta = POLLUTANT_META[key];
          const val = station.readings[key];
          const pct = Math.min(100, (val / meta.maxScale) * 100);
          const whoPct = Math.min(100, (meta.whoGuideline / meta.maxScale) * 100);
          const exceedsWho = val > meta.whoGuideline;
          const isMapSelectable = key === 'pm25' || key === 'pm10' || key === 'o3' || key === 'no2';
          const isSelectedOnMap = activeMetric === key;

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                disabled={!isMapSelectable}
                onClick={() => {
                  if (isMapSelectable) onSelectMetric(key);
                }}
                className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                  isMapSelectable ? 'cursor-pointer' : 'cursor-default'
                } ${
                  isSelectedOnMap
                    ? 'border-slate-900 dark:border-slate-200 bg-slate-50 dark:bg-slate-800/60'
                    : 'border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                      {meta.formula}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {meta.name}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-mono-tabular whitespace-nowrap shrink-0 ${
                      exceedsWho
                        ? 'text-amber-700 dark:text-amber-400 font-medium'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {exceedsWho ? 'Above WHO' : 'Within WHO'}
                  </span>
                </div>

                <div className="mt-2 flex items-baseline gap-1.5">
                  <AnimatedNumber
                    value={val}
                    decimals={key === 'co' ? 2 : 1}
                    className="text-2xl font-semibold text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                    {meta.unit}
                  </span>
                </div>

                {/* Progress Scale with WHO Guideline Tick */}
                <div className="mt-2.5 relative h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-visible">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Math.max(0.03, pct / 100) }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    style={{ originX: 0 }}
                    className={`h-full w-full rounded-full ${
                      exceedsWho
                        ? 'bg-amber-500 dark:bg-amber-400'
                        : 'bg-emerald-600 dark:bg-emerald-400'
                    }`}
                  />
                  <span
                    title={`WHO guideline: ${meta.whoGuideline} ${meta.unit}`}
                    style={{ left: `${whoPct}%` }}
                    className="absolute -top-1 w-[1.5px] h-3.5 bg-slate-400 dark:bg-slate-500"
                  />
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
