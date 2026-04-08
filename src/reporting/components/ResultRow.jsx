import React from 'react';

/** Category → badge colour */
const CATEGORY_COLOURS = {
  'Prudential':            { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  'AML / CFT':             { bg: '#fefce8', color: '#854d0e', border: '#fef08a' },
  'Consumer Protection':   { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  'Payments':              { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  'Operational Resilience':{ bg: '#fff7ed', color: '#9a3412', border: '#fed7aa' },
  'Securities':            { bg: '#fdf4ff', color: '#86198f', border: '#f5d0fe' },
  'ESG / Disclosure':      { bg: '#f0fdf4', color: '#14532d', border: '#86efac' },
};

function CategoryBadge({ category }) {
  const style = CATEGORY_COLOURS[category] || { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' };
  return (
    <span
      className="category-badge"
      style={{ background: style.bg, color: style.color, borderColor: style.border }}
    >
      {category}
    </span>
  );
}

/** Wraps a search term's match in a highlight span. */
function Highlight({ text, query }) {
  if (!query || !query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="highlight">{part}</mark>
          : part
      )}
    </>
  );
}

/**
 * A single result row with all 4 primary fields and extra metadata.
 */
export function ResultRow({ item, index, query }) {
  return (
    <tr className={`result-row ${index % 2 === 0 ? 'result-row--even' : ''}`}>

      {/* Title */}
      <td className="td td--title">
        <div className="title-wrap">
          <span className="row-number">{index + 1}</span>
          <div>
            <div className="title-text">
              <Highlight text={item.title} query={query} />
            </div>
            <div className="title-meta">
              {item.regulator} · {item.year}
            </div>
          </div>
        </div>
      </td>

      {/* URL */}
      <td className="td td--url">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          className="url-link"
          title={item.url}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M8 1h3v3M11 1L6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Open source
        </a>
      </td>

      {/* Reason Flagged */}
      <td className="td td--reason">
        <Highlight text={item.reasonFlagged} query={query} />
      </td>

      {/* Jurisdiction + Category */}
      <td className="td td--jurisdiction">
        <div className="jurisdiction-wrap">
          <span className="jurisdiction-text">
            <Highlight text={item.jurisdiction} query={query} />
          </span>
          <CategoryBadge category={item.category} />
        </div>
      </td>

    </tr>
  );
}
