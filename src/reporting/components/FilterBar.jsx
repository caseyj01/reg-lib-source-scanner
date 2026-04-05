import React from 'react';

/**
 * Post-scan filter bar — lets analysts narrow down results without re-scanning.
 * Not a search trigger; filters the already-loaded result set in real time.
 */
export function FilterBar({ value, onChange, count, total }) {
  return (
    <div className="filter-bar">
      <div className="filter-inner">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="6.5" cy="6.5" r="4.75" stroke="#9ca3af" strokeWidth="1.5" />
          <line x1="10" y1="10" x2="13.5" y2="13.5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          className="filter-input"
          type="text"
          placeholder="Filter results by keyword, jurisdiction, category…"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        {value && (
          <button className="filter-clear" onClick={() => onChange('')} aria-label="Clear filter">✕</button>
        )}
      </div>
      <span className="filter-count">
        {value ? `${count} of ${total}` : `${total}`} result{total !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
