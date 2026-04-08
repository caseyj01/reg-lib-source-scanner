import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const movingMap = {
  TOP:    'radial-gradient(20.7% 50% at 50% 0%,    hsl(0,0%,100%) 0%, rgba(255,255,255,0) 100%)',
  LEFT:   'radial-gradient(16.6% 43.1% at 0% 50%,  hsl(0,0%,100%) 0%, rgba(255,255,255,0) 100%)',
  BOTTOM: 'radial-gradient(20.7% 50% at 50% 100%,  hsl(0,0%,100%) 0%, rgba(255,255,255,0) 100%)',
  RIGHT:  'radial-gradient(16.2% 41.2% at 100% 50%, hsl(0,0%,100%) 0%, rgba(255,255,255,0) 100%)',
};

const highlight =
  'radial-gradient(75% 181.16% at 50% 50%, #3275F8 0%, rgba(255,255,255,0) 100%)';

const DIRS = ['TOP', 'LEFT', 'BOTTOM', 'RIGHT'];

export function HoverBorderGradient({
  children,
  onClick,
  disabled = false,
  duration = 1,
  clockwise = true,
  className = '',
  innerClassName = '',
  title,
  type = 'button',
}) {
  const [hovered, setHovered]     = useState(false);
  const [direction, setDirection] = useState('BOTTOM');

  useEffect(() => {
    if (hovered || disabled) return;
    const interval = setInterval(() => {
      setDirection(prev => {
        const idx = DIRS.indexOf(prev);
        return clockwise
          ? DIRS[(idx - 1 + DIRS.length) % DIRS.length]
          : DIRS[(idx + 1) % DIRS.length];
      });
    }, duration * 1000);
    return () => clearInterval(interval);
  }, [hovered, disabled, duration, clockwise]);

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`hvbg-outer ${disabled ? 'hvbg-disabled' : ''} ${className}`}
    >
      {/* animated glow border */}
      <motion.div
        className="hvbg-glow"
        initial={{ background: movingMap[direction] }}
        animate={{
          background: hovered
            ? [movingMap[direction], highlight]
            : movingMap[direction],
        }}
        transition={{ ease: 'linear', duration }}
      />
      {/* dark fill sits just inside the glow, creating the border illusion */}
      <div className="hvbg-fill" />
      {/* content on top */}
      <div className={`hvbg-content ${innerClassName}`}>{children}</div>
    </button>
  );
}
