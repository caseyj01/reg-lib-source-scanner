import React from 'react';

/**
 * Downloads the current results array as a CSV file.
 * Only shown when there are results to export.
 */
export function ExportButton({ results }) {
  if (!results || results.length === 0) return null;

  function handleExport() {
    const headers = ['Title / Name', 'URL', 'Reason Flagged', 'Jurisdiction', 'Regulator', 'Year', 'Category'];

    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = results.map(r => [
      escape(r.title),
      escape(r.url),
      escape(r.reasonFlagged),
      escape(r.jurisdiction),
      escape(r.regulator),
      escape(r.year),
      escape(r.category),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `reg-sources-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button className="export-btn" onClick={handleExport}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 10V2M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 11v1.5A1.5 1.5 0 003.5 14h9A1.5 1.5 0 0014 12.5V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Export {results.length} result{results.length !== 1 ? 's' : ''} to CSV
    </button>
  );
}
