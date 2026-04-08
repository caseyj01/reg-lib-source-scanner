import React from 'react';

/**
 * Full-width search bar with a prominent Search button.
 * Calls onSearch() on button click or Enter key.
 */
export function SearchBar({ value, onChange, onSearch, loading }) {
  return (
    <div className="search-bar-wrap">
      <div className="search-inner">
        {/* magnifier icon */}
        <svg className="search-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="5.75" stroke="#9ca3af" strokeWidth="1.75" />
          <line x1="13" y1="13" x2="18" y2="18" stroke="#9ca3af" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        <input
          className="search-input"
          type="text"
          placeholder="Search by regulation name, keyword, or jurisdiction…"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && onSearch()}
          autoFocus
        />
        {value && (
          <button
            className="clear-btn"
            onClick={() => onChange('')}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>
      <button
        className={`search-btn ${loading ? 'search-btn--loading' : ''}`}
        onClick={onSearch}
        disabled={loading}
      >
        {loading
          ? <><span className="btn-spinner" /> Searching…</>
          : 'Search'}
      </button>
    </div>
  );
}
