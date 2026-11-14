import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpDown, Search } from 'lucide-react';
import type { SensorStation } from '../types/aqi';
import { getAqiCategory } from '../utils/aqi';

interface StationDirectoryProps {
  stations: SensorStation[];
  selectedStationId: string;
  onSelectStation: (id: string) => void;
  nearestStationId?: string | null;
}

export function StationDirectory({
  stations,
  selectedStationId,
  onSelectStation,
  nearestStationId,
}: StationDirectoryProps) {
  const [query, setQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  const filteredStations = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? stations.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.district.toLowerCase().includes(q) ||
            s.environmentType.toLowerCase().includes(q)
        )
      : stations;

    return [...list].sort((a, b) =>
      sortAsc ? a.readings.aqi - b.readings.aqi : b.readings.aqi - a.readings.aqi
    );
  }, [stations, query, sortAsc]);

  return (
    <section
      aria-label="Basin monitoring stations"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] p-5 transition-colors duration-300"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        <div>
          <h3 className="font-display text-lg font-medium text-slate-900 dark:text-slate-100">
            Station Network
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select any monitoring node to center telemetry
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter stations..."
              aria-label="Filter monitoring stations"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 w-44 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => setSortAsc((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{sortAsc ? 'Lowest AQI' : 'Highest AQI'}</span>
          </motion.button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[290px] overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <th className="py-2 pr-3 font-medium">Station</th>
              <th className="py-2 px-3 font-medium">Zone</th>
              <th className="py-2 px-3 font-medium text-right">Elev</th>
              <th className="py-2 px-3 font-medium text-right">PM₂.₅</th>
              <th className="py-2 pl-3 font-medium text-right">US AQI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
            {filteredStations.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                  No stations match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            ) : (
              filteredStations.map((st) => {
                const isSelected = st.id === selectedStationId;
                const isNearest = nearestStationId === st.id;
                const cat = getAqiCategory(st.readings.aqi);
                return (
                  <tr
                    key={st.id}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-sky-50/70 dark:bg-sky-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <button
                        type="button"
                        onClick={() => onSelectStation(st.id)}
                        className="text-left font-medium text-slate-900 dark:text-slate-100 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-sm"
                      >
                        {st.name}
                      </button>
                      {isNearest && (
                        <span className="ml-1.5 inline-block text-[10px] font-mono-tabular font-semibold text-sky-700 dark:text-sky-400">
                          Nearest
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                      {st.distanceKm !== undefined ? (
                        <span className="font-mono-tabular">{st.distanceKm} km · {st.district}</span>
                      ) : (
                        <span>{st.district} · {st.environmentType}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-500 dark:text-slate-400">
                      {st.elevationM}m
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                      {st.readings.pm25.toFixed(1)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono-tabular font-semibold">
                      <span className={cat.textClass}>
                        {cat.glyph} {st.readings.aqi}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
