/**
 * @fileoverview Excel export module using SheetJS.
 * Generates a three-sheet .xlsx workbook:
 *   1. "New Regulations Found"   – new items only
 *   2. "Already In Library"      – duplicate matches
 *   3. "Summary"                 – high-level stats
 */

import * as XLSX from 'xlsx';

// ── Column width definitions (wch = character width) ─────────────────────────
const NEW_REG_COLS = [
  { wch: 45 },  // Regulation Title
  { wch: 20 },  // Regulation Type
  { wch: 25 },  // Issuing Authority
  { wch: 18 },  // Jurisdiction
  { wch: 12 },  // Region
  { wch: 13 },  // Year Enacted
  { wch: 13 },  // Last Amended
  { wch: 30 },  // Primary Legislation Ref
  { wch: 22 },  // Sector / Topic
  { wch: 22 },  // Sub-sector
  { wch: 11 },  // Binding?
  { wch: 50 },  // Source URL
  { wch: 24 },  // Official Document Ref
  { wch: 60 },  // Summary
  { wch: 40 },  // Analyst Notes (blank)
  { wch: 16 },  // Review Priority (blank)
  { wch: 14 },  // Status
];

const DUPE_COLS = [
  { wch: 45 },  // Regulation Title
  { wch: 18 },  // Jurisdiction
  { wch: 12 },  // Region
  { wch: 25 },  // Issuing Authority
  { wch: 45 },  // Matched By
  { wch: 20 },  // Library ID
  { wch: 14 },  // Confidence %
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply column widths and freeze/filter to a worksheet.
 *
 * @param {XLSX.WorkSheet} ws
 * @param {{ wch: number }[]} colWidths
 * @param {boolean} [freeze] - Whether to freeze row 1.
 * @param {boolean} [filter] - Whether to enable auto-filter on row 1.
 */
function applySheetStyle(ws, colWidths, freeze = false, filter = false) {
  ws['!cols'] = colWidths;
  if (freeze) {
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
  }
  if (filter && ws['!ref']) {
    ws['!autofilter'] = { ref: ws['!ref'] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Export tagged regulation results to a three-sheet Excel workbook and
 * trigger a browser download.
 *
 * Only items where dedup.isDuplicate === false appear in "New Regulations Found".
 *
 * @param {Object[]} taggedResults  - Output from tagResults() in dedup.js.
 * @param {string}   searchQuery    - The user's original search query.
 */
export function exportToExcel(taggedResults, searchQuery) {
  const newOnly  = taggedResults.filter(r => r.dedup && !r.dedup.isDuplicate);
  const dupOnly  = taggedResults.filter(r => r.dedup &&  r.dedup.isDuplicate);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // ── Sheet 1: New Regulations Found ────────────────────────────────────────
  const newHeader = [
    'Regulation Title',
    'Regulation Type',
    'Issuing Authority',
    'Jurisdiction',
    'Region',
    'Year Enacted',
    'Last Amended',
    'Primary Legislation Ref',
    'Sector / Topic',
    'Sub-sector',
    'Binding?',
    'Source URL',
    'Official Document Ref',
    'Summary',
    'Analyst Notes',
    'Review Priority',
    'Status',
  ];

  const newRows = newOnly.map(r => [
    r.title          || '',
    r.type           || '',
    r.authority      || r.regulator || '',
    r.jurisdiction   || '',
    r.region         || '',
    r.year           || r.yearEnacted || '',
    r.lastAmended    || '',
    r.primaryLegRef  || '',
    r.sector         || r.category || '',
    r.subSector      || '',
    r.binding === true ? 'Yes' : r.binding === false ? 'No' : '',
    r.sourceUrl      || r.url || '',
    r.officialRef    || '',
    r.summary        || '',
    '',                     // Analyst Notes — blank
    '',                     // Review Priority — blank
    'Pending Review',       // Status default
  ]);

  const wsNew = XLSX.utils.aoa_to_sheet([newHeader, ...newRows]);
  applySheetStyle(wsNew, NEW_REG_COLS, true, true);

  // ── Sheet 2: Already In Library ───────────────────────────────────────────
  const dupHeader = [
    'Regulation Title',
    'Jurisdiction',
    'Region',
    'Issuing Authority',
    'Matched By',
    'Library ID',
    'Confidence %',
  ];

  const dupRows = dupOnly.map(r => [
    r.title               || '',
    r.jurisdiction        || '',
    r.region              || '',
    r.authority           || r.regulator || '',
    r.dedup.matchedTitle  || '',
    r.dedup.matchedId     || '',
    r.dedup.confidence + '%',
  ]);

  const wsDup = XLSX.utils.aoa_to_sheet([dupHeader, ...dupRows]);
  applySheetStyle(wsDup, DUPE_COLS, true, false);

  // ── Sheet 3: Summary ──────────────────────────────────────────────────────
  const regions      = [...new Set(taggedResults.map(r => r.region).filter(Boolean))];
  const jurisdictions = [...new Set(taggedResults.map(r => r.jurisdiction).filter(Boolean))];

  const summaryData = [
    ['Field',              'Value'],
    ['Search Query',       searchQuery || ''],
    ['Export Date',        today],
    ['Total Sources Found', taggedResults.length],
    ['New Regulations',    newOnly.length],
    ['Already In Library', dupOnly.length],
    ['Regions Covered',    regions.join(', ')],
    ['Unique Jurisdictions', jurisdictions.length],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 50 }];

  // ── Workbook assembly ─────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsNew,    'New Regulations Found');
  XLSX.utils.book_append_sheet(wb, wsDup,    'Already In Library');
  XLSX.utils.book_append_sheet(wb, wsSummary,'Summary');

  const filename = `Reg_Library_NewSources_${today}.xlsx`;
  XLSX.writeFile(wb, filename);
}
