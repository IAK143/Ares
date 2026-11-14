import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Crosshair, Loader2, MapPin, Search, X } from 'lucide-react';
import type { GeoLocationSuggestion } from '../types/aqi';
import { searchLocationSuggestions } from '../data/regions';

interface LocationSearchProps {
  onSelectLocation: (loc: GeoLocationSuggestion) => void;
  onRequestLiveLocation?: () => void;
  geoLocating?: boolean;
}

export function LocationSearch({
  onSelectLocation,
  onRequestLiveLocation,
  geoLocating = false,
}: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoLocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [localGeoPending, setLocalGeoPending] = useState(false);

  const geoPending = geoLocating || localGeoPending;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Debounced live location suggestions while typing
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchLocationSuggestions(trimmed, controller.signal);
      if (!controller.signal.aborted) {
        setSuggestions(results);
        setIsSearching(false);
        setIsOpen(true);
        setActiveIndex(results.length > 0 ? 0 : -1);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const handleChoose = (loc: GeoLocationSuggestion) => {
    setQuery(`${loc.name}, ${loc.country}`);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelectLocation(loc);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Escape') setIsOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((idx) => (idx + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((idx) => (idx <= 0 ? suggestions.length - 1 : idx - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleChoose(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleUseCurrentLocation = () => {
    setIsOpen(false);
    if (onRequestLiveLocation) {
      setQuery('');
      onRequestLiveLocation();
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocalGeoPending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalGeoPending(false);
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        onSelectLocation({
          id: `geo-me-${Date.now()}`,
          name: 'Current Location',
          country: `${lat}°, ${lon}°`,
          lat,
          lon,
        });
        setQuery('Current Location');
      },
      () => {
        setLocalGeoPending(false);
      },
      { timeout: 6000 }
    );
  };

  return (
    <div ref={containerRef} className="relative w-full sm:w-80 lg:w-96">
      <div className="relative flex items-center">
        <Search
          className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-autocomplete="list"
          aria-controls="location-suggestions-listbox"
          aria-label="Find any city or location for live AQI"
          placeholder="Search city or region (e.g. Paris, Seoul)..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length >= 2) setIsOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-16 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151e] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
        />

        <div className="absolute right-1.5 flex items-center gap-0.5">
          {isSearching && (
            <Loader2
              className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 animate-spin mr-1"
              aria-hidden="true"
            />
          )}
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setIsOpen(false);
                inputRef.current?.focus();
              }}
              aria-label="Clear location search"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={handleUseCurrentLocation}
            disabled={geoPending}
            title="Use browser GPS live location"
            aria-label="Detect my current location"
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 rounded cursor-pointer disabled:opacity-50"
          >
            <Crosshair
              className={`w-3.5 h-3.5 ${geoPending ? 'animate-pulse text-sky-500' : ''}`}
              aria-hidden="true"
            />
          </motion.button>
        </div>
      </div>

      {/* Live Autocomplete Suggestions Popover */}
      <AnimatePresence>
        {isOpen && query.trim().length >= 2 && (
          <motion.div
            id="location-suggestions-listbox"
            role="listbox"
            aria-label="Location suggestions"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 mt-1.5 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl shadow-slate-900/10 dark:shadow-black/50 overflow-hidden"
          >
            {isSearching && suggestions.length === 0 ? (
              <div className="px-3.5 py-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Finding matching locations...</span>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="px-3.5 py-3 text-xs text-slate-500 dark:text-slate-400">
                No locations found for &ldquo;{query.trim()}&rdquo;.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-64 overflow-y-auto">
                {suggestions.map((loc, idx) => {
                  const isHighlighted = idx === activeIndex;
                  return (
                    <li key={loc.id} role="option" aria-selected={isHighlighted}>
                      <button
                        type="button"
                        onClick={() => handleChoose(loc)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isHighlighted
                            ? 'bg-sky-50/90 dark:bg-sky-950/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <MapPin
                            className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                              isHighlighted
                                ? 'text-sky-600 dark:text-sky-400'
                                : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {loc.name}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {loc.admin1 ? `${loc.admin1}, ${loc.country}` : loc.country}
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono-tabular text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                          <div>
                            {loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°
                          </div>
                          {loc.elevationM !== undefined && <div>{loc.elevationM}m</div>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
