import { useEffect, useState } from 'react';
import { animate, useMotionValue } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  className?: string;
}

export function AnimatedNumber({ value, decimals = 0, className = '' }: AnimatedNumberProps) {
  const motionVal = useMotionValue(value);
  const [display, setDisplay] = useState(() =>
    decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString()
  );

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        setDisplay(decimals > 0 ? latest.toFixed(decimals) : Math.round(latest).toString());
      },
    });
    return () => controls.stop();
  }, [value, decimals, motionVal]);

  return <span className={`font-mono-tabular ${className}`}>{display}</span>;
}
