import { AnimatePresence, motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';

export type NavSection = 'overview' | 'heatmap' | 'alerts' | 'forecast';

interface TopBarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  isDark: boolean;
  onToggleDark: () => void;
  unacknowledgedCount: number;
}

const NAV_ITEMS: Array<{ id: NavSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'heatmap', label: 'Sensor Map' },
  { id: 'alerts', label: 'Alert Rules' },
  { id: 'forecast', label: 'Trajectory' },
];

export function TopBar({
  activeSection,
  onSelectSection,
  isDark,
  onToggleDark,
  unacknowledgedCount,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/90 dark:bg-[#090b10]/90 backdrop-blur-md transition-colors duration-300">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element editorial brand wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('overview');
          }}
          className="font-display text-xl font-medium tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-sm"
        >
          Aeris
        </a>

        {/* Zone 2: Clean single-line text navigation */}
        <nav aria-label="Primary sections" className="hidden md:flex items-center gap-7">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`relative py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-sm cursor-pointer ${
                  isActive
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <span>{item.label}</span>
                {item.id === 'alerts' && unacknowledgedCount > 0 && (
                  <span className="ml-1.5 font-mono-tabular text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                    ({unacknowledgedCount})
                  </span>
                )}
                {isActive && (
                  <motion.span
                    layoutId="topbar-active-underline"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className="absolute left-0 right-0 -bottom-[1px] h-[1.5px] bg-slate-900 dark:bg-slate-100"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action — Accessible Dark Mode Toggle */}
        <div className="flex items-center shrink-0">
          <motion.button
            type="button"
            onClick={onToggleDark}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            aria-pressed={isDark}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to night dark mode'}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <AnimatePresence mode="wait" initial={false}>
              {isDark ? (
                <motion.span
                  key="sun"
                  initial={{ rotate: -60, opacity: 0, scale: 0.7 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 60, opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-flex items-center text-amber-400"
                >
                  <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                </motion.span>
              ) : (
                <motion.span
                  key="moon"
                  initial={{ rotate: 60, opacity: 0, scale: 0.7 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: -60, opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-flex items-center text-slate-700"
                >
                  <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                </motion.span>
              )}
            </AnimatePresence>
            <span>{isDark ? 'Day Mode' : 'Night Mode'}</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}
