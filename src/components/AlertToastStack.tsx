import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, MapPin, X } from 'lucide-react';
import type { AirAlert } from '../types/aqi';
import { formatRelativeTime, getAqiCategory, POLLUTANT_META } from '../utils/aqi';

interface AlertToastStackProps {
  toasts: AirAlert[];
  onDismiss: (id: string) => void;
  onInspectStation: (stationId: string) => void;
}

export function AlertToastStack({ toasts, onDismiss, onInspectStation }: AlertToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Real-time air quality alerts"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 w-[calc(100vw-2.5rem)] max-w-sm pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.slice(0, 2).map((alert) => {
          const cat = getAqiCategory(alert.aqi);
          const meta = POLLUTANT_META[alert.metric];
          return (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="pointer-events-auto rounded-xl border border-slate-200 dark:border-slate-700/90 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 shadow-lg shadow-slate-900/10 dark:shadow-black/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className={`mt-0.5 shrink-0 ${cat.textClass}`} aria-hidden="true">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`font-semibold ${cat.textClass}`}>
                        {cat.glyph} {cat.label}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{formatRelativeTime(alert.timestamp)}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {alert.stationName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      <span className="font-mono-tabular font-semibold">
                        {meta.formula} {alert.value} {meta.unit}
                      </span>{' '}
                      exceeded {alert.threshold} {meta.unit} threshold.
                    </p>
                  </div>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onDismiss(alert.id)}
                  aria-label={`Dismiss alert for ${alert.stationName}`}
                  className="p-1.5 -m-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </motion.button>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {alert.regionName}
                </span>
                <motion.button
                  type="button"
                  whileHover={{ x: 1 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onInspectStation(alert.stationId)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MapPin className="w-3 h-3" aria-hidden="true" />
                  <span>Locate sensor</span>
                </motion.button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
