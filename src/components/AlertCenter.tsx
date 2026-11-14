import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  MapPin,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type { AirAlert, AlertRule, MapMetricKey } from '../types/aqi';
import { formatRelativeTime, getAqiCategory, POLLUTANT_META } from '../utils/aqi';

interface AlertCenterProps {
  alerts: AirAlert[];
  rules: AlertRule[];
  desktopPermission: NotificationPermission | 'unsupported';
  soundEnabled: boolean;
  onRequestDesktopPermission: () => void;
  onToggleSound: () => void;
  onAcknowledgeAlert: (id: string) => void;
  onAcknowledgeAll: () => void;
  onToggleRule: (id: string) => void;
  onUpdateThreshold: (id: string, nextThreshold: number) => void;
  onAddRule: (rule: Omit<AlertRule, 'id'>) => void;
  onDeleteRule: (id: string) => void;
  onInspectStation: (stationId: string) => void;
  onSimulateSpike: () => void;
}

const RULE_METRIC_OPTIONS: Array<{ id: MapMetricKey; label: string; defaultVal: number }> = [
  { id: 'aqi', label: 'US AQI', defaultVal: 100 },
  { id: 'pm25', label: 'PM₂.₅ (µg/m³)', defaultVal: 35 },
  { id: 'pm10', label: 'PM₁₀ (µg/m³)', defaultVal: 80 },
  { id: 'o3', label: 'O₃ (µg/m³)', defaultVal: 120 },
  { id: 'no2', label: 'NO₂ (µg/m³)', defaultVal: 70 },
];

export function AlertCenter({
  alerts,
  rules,
  desktopPermission,
  soundEnabled,
  onRequestDesktopPermission,
  onToggleSound,
  onAcknowledgeAlert,
  onAcknowledgeAll,
  onToggleRule,
  onUpdateThreshold,
  onAddRule,
  onDeleteRule,
  onInspectStation,
  onSimulateSpike,
}: AlertCenterProps) {
  const [activeTab, setActiveTab] = useState<'feed' | 'rules'>('feed');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMetric, setNewMetric] = useState<MapMetricKey>('aqi');
  const [newThreshold, setNewThreshold] = useState('75');
  const [newLabel, setNewLabel] = useState('');
  const [formError, setFormError] = useState('');

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged);

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(newThreshold);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setFormError('Enter a threshold value greater than 0.');
      return;
    }
    const trimmedLabel = newLabel.trim() || `${POLLUTANT_META[newMetric].formula} > ${numeric}`;
    onAddRule({
      label: trimmedLabel,
      metric: newMetric,
      threshold: numeric,
      enabled: true,
      notifyDesktop: true,
    });
    setNewLabel('');
    setNewThreshold('75');
    setFormError('');
    setShowAddForm(false);
  };

  return (
    <section
      id="alerts"
      aria-label="Real-time air quality alerts and threshold rules"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] p-5 transition-colors duration-300"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Real-Time Threshold Monitor</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              {unacknowledgedAlerts.length} Active
            </span>
          </div>
          <h2 className="font-display text-lg font-medium text-slate-900 dark:text-slate-100 mt-0.5">
            Air Quality Alerts
          </h2>
        </div>

        {/* Delivery Channel Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={onSimulateSpike}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-300 dark:border-amber-700/70 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Test Alert</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={onToggleSound}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            )}
            <span>{soundEnabled ? 'Chime On' : 'Muted'}</span>
          </motion.button>

          {desktopPermission !== 'unsupported' && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={onRequestDesktopPermission}
              disabled={desktopPermission === 'granted'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                desktopPermission === 'granted'
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 cursor-default'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer'
              }`}
            >
              {desktopPermission === 'granted' ? (
                <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>
                {desktopPermission === 'granted'
                  ? 'Push Enabled'
                  : desktopPermission === 'denied'
                  ? 'Push Muted'
                  : 'Enable Push'}
              </span>
            </motion.button>
          )}
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="mt-3.5 flex items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Alert center views"
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'feed'}
            onClick={() => setActiveTab('feed')}
            className={`relative px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'feed'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {activeTab === 'feed' && (
              <motion.span
                layoutId="alert-tab-pill"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs border border-slate-200/80 dark:border-slate-700"
              />
            )}
            <span className="relative z-10">
              Live Feed ({alerts.length})
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'rules'}
            onClick={() => setActiveTab('rules')}
            className={`relative px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'rules'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {activeTab === 'rules' && (
              <motion.span
                layoutId="alert-tab-pill"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs border border-slate-200/80 dark:border-slate-700"
              />
            )}
            <span className="relative z-10">
              Alert Rules ({rules.filter((r) => r.enabled).length}/{rules.length})
            </span>
          </button>
        </div>

        {activeTab === 'feed' && unacknowledgedAlerts.length > 0 && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={onAcknowledgeAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Acknowledge all</span>
          </motion.button>
        )}

        {activeTab === 'rules' && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showAddForm ? 'Close' : 'New rule'}</span>
          </motion.button>
        )}
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        <AnimatePresence mode="wait">
          {activeTab === 'feed' ? (
            <motion.div
              key="feed-panel"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1"
            >
              {alerts.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    All monitored sensors are within your configured thresholds
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Lower a threshold in Alert Rules or click Test Alert to preview real-time delivery.
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {alerts.map((alert) => {
                    const cat = getAqiCategory(alert.aqi);
                    const meta = POLLUTANT_META[alert.metric];
                    return (
                      <motion.div
                        key={alert.id}
                        layout
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: alert.acknowledged ? 0.65 : 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className={`p-3.5 rounded-xl border transition-colors ${
                          alert.acknowledged
                            ? 'border-slate-100 dark:border-slate-800/70 bg-slate-50/50 dark:bg-slate-900/30'
                            : `${cat.borderTintClass} ${cat.surfaceTintClass}`
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className={`font-semibold ${cat.textClass}`}>
                                {cat.glyph} {cat.label}
                              </span>
                              <span className="text-slate-400" aria-hidden="true">·</span>
                              <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                                {formatRelativeTime(alert.timestamp)}
                              </span>
                              {alert.acknowledged && (
                                <>
                                  <span className="text-slate-400" aria-hidden="true">·</span>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    Acknowledged
                                  </span>
                                </>
                              )}
                            </div>

                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {alert.stationName}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-mono-tabular font-semibold">
                                {meta.formula} {alert.value} {meta.unit}
                              </span>{' '}
                              exceeded limit of {alert.threshold} {meta.unit}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.92 }}
                              onClick={() => onInspectStation(alert.stationId)}
                              aria-label={`Locate ${alert.stationName} on map`}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                            </motion.button>

                            {!alert.acknowledged && (
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.92 }}
                                onClick={() => onAcknowledgeAlert(alert.id)}
                                aria-label={`Acknowledge alert for ${alert.stationName}`}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              </motion.button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="rules-panel"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              {/* New Rule Form */}
              <AnimatePresence>
                {showAddForm && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleCreateRule}
                    className="overflow-hidden"
                  >
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 space-y-3 mb-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label
                            htmlFor="new-rule-metric"
                            className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1"
                          >
                            Pollutant
                          </label>
                          <select
                            id="new-rule-metric"
                            value={newMetric}
                            onChange={(e) => {
                              const nextM = e.target.value as MapMetricKey;
                              setNewMetric(nextM);
                              const def = RULE_METRIC_OPTIONS.find((o) => o.id === nextM);
                              if (def) setNewThreshold(String(def.defaultVal));
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                          >
                            {RULE_METRIC_OPTIONS.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="new-rule-threshold"
                            className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1"
                          >
                            Alert above ({POLLUTANT_META[newMetric].unit})
                          </label>
                          <input
                            id="new-rule-threshold"
                            type="number"
                            min={1}
                            step="any"
                            value={newThreshold}
                            onChange={(e) => {
                              setNewThreshold(e.target.value);
                              setFormError('');
                            }}
                            className="w-full px-2.5 py-1.5 text-xs font-mono-tabular rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="new-rule-label"
                            className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1"
                          >
                            Rule label
                          </label>
                          <input
                            id="new-rule-label"
                            type="text"
                            placeholder="e.g. Morning run limit"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      {formError && (
                        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                          {formError}
                        </p>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <motion.button
                          type="submit"
                          whileTap={{ scale: 0.96 }}
                          className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 hover:opacity-90 cursor-pointer"
                        >
                          Save Rule
                        </motion.button>
                      </div>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Rule List */}
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {rules.map((rule) => {
                  const meta = POLLUTANT_META[rule.metric];
                  return (
                    <div
                      key={rule.id}
                      className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {rule.label}
                          </span>
                          <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                            {meta.formula}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2.5">
                          <label
                            htmlFor={`thresh-${rule.id}`}
                            className="text-xs text-slate-500 dark:text-slate-400"
                          >
                            Threshold:
                          </label>
                          <input
                            id={`thresh-${rule.id}`}
                            type="range"
                            min={rule.metric === 'aqi' ? 25 : 10}
                            max={rule.metric === 'aqi' ? 250 : 180}
                            step={5}
                            value={rule.threshold}
                            onChange={(e) => onUpdateThreshold(rule.id, Number(e.target.value))}
                            className="w-28 accent-sky-600 dark:accent-sky-400 cursor-pointer"
                          />
                          <span className="text-xs font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
                            {rule.threshold} {meta.unit}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Accessible Animated Switch */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={rule.enabled}
                          aria-label={`Toggle rule ${rule.label}`}
                          onClick={() => onToggleRule(rule.id)}
                          className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                            rule.enabled
                              ? 'bg-slate-900 dark:bg-sky-500'
                              : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        >
                          <motion.span
                            layout
                            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                            className={`block w-3.5 h-3.5 rounded-full bg-white shadow-xs ${
                              rule.enabled ? 'ml-[19px]' : 'ml-[3px]'
                            }`}
                          />
                        </button>

                        {rules.length > 1 && (
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onDeleteRule(rule.id)}
                            aria-label={`Delete rule ${rule.label}`}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </motion.button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
