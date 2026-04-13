/**
 * Export findings to the FS Requirements-AI Upload Sheet format.
 * Matches the exact column structure used by analysts before sending to GEM.
 */

export function toTemplateRows(findings) {
  return (Array.isArray(findings) ? findings : []).map(f => ({
    reqReport:    'Y',
    requirement:  f?.requirement  || f?.reference || '',
    description:  f?.description  || '',
    analystGuide: f?.analystGuide || '',
    reference:    f?.reference    || '',
    sourceUrl1:   f?.sourceUrl1   || '',
    sourceUrl2:   f?.sourceUrl2   || '',
  }));
}

// ── XLSX download ─────────────────────────────────────────────────────────────
export async function downloadTemplateXLSX(rows, filename) {
  const XLSX = await import('xlsx');

  const HEADERS = [
    'REQ REPORT? (For Tech Only)',
    'Requirement',
    'Description',
    'Analyst Guide (What to consider)',
    'Reference (one per row)',
    'Source links URL 1 (For monitoring purposes)',
    'Source links URL 2 (direct source link)',
  ];

  const data = rows.map(r => ([
    r.reqReport      || 'Y',
    r.requirement    || '',
    r.description    || '',
    r.analystGuide   || '',
    r.reference      || '',
    r.sourceUrl1     || '',
    r.sourceUrl2     || '',
  ]));

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...data]);

  // Column widths
  ws['!cols'] = [
    { wch: 8 }, { wch: 30 }, { wch: 40 }, { wch: 40 },
    { wch: 40 }, { wch: 50 }, { wch: 50 },
  ];

  // Header row style (bold)
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[cellAddr]) {
      ws[cellAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8F0FE' } } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Requirements');
  XLSX.writeFile(wb, filename);
}

// ── CSV download — matches FS Requirements Upload Sheet ───────────────────────
export function downloadTemplateCSV(rows, filename) {
  const HEADERS = [
    'REQ REPORT? (For Tech Only)',
    'Requirement',
    'Description',
    'Analyst Guide (What to consider)',
    'Reference (one per row)',
    'Source links URL 1 (For monitoring purposes)',
    'Source links URL 2 (direct source link)',
  ];

  const esc = v => {
    const s = String(v ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = rows.map(r => {
    return [
      esc(r.reqReport      || 'Y'),
      esc(r.requirement    || ''),
      esc(r.description    || ''),
      esc(r.analystGuide   || ''),
      esc(r.reference      || ''),
      esc(r.sourceUrl1     || ''),
      esc(r.sourceUrl2     || ''),
    ].join(',');
  });

  const csv  = [HEADERS.join(','), ...lines].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
