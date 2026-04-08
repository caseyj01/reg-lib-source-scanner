import React from 'react';
import { ResultRow } from './ResultRow.jsx';

/**
 * Renders the full results table, or empty/no-results states.
 */
export function ResultsTable({ results, query, hasSearched }) {
  if (!hasSearched) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔍</div>
        <div className="empty-title">Enter a keyword to begin</div>
        <div className="empty-sub">
          Try searching for a regulation name, topic, or jurisdiction —
          e.g. <em>AML</em>, <em>Basel</em>, <em>EU</em>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📭</div>
        <div className="empty-title">No results found</div>
        <div className="empty-sub">
          Try a different keyword or clear your search to see all sources.
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <div className="result-count">
        Showing <strong>{results.length}</strong> regulation{results.length !== 1 ? 's' : ''}
        {query && <> matching <em>"{query}"</em></>}
      </div>
      <div className="table-scroll">
        <table className="results-table">
          <thead>
            <tr>
              <th className="th th--title">Regulation / Name</th>
              <th className="th th--url">Source</th>
              <th className="th th--reason">Why It Was Flagged</th>
              <th className="th th--jurisdiction">Jurisdiction</th>
            </tr>
          </thead>
          <tbody>
            {results.map((item, i) => (
              <ResultRow key={item.id} item={item} index={i} query={query} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
