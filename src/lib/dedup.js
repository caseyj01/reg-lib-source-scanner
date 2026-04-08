/**
 * @fileoverview Deduplication engine for matching found regulations against
 * an existing compliance library using fuzzy string similarity.
 */

/** Minimum similarity score (0–1) to consider two regulation titles a match. */
export const DEDUP_THRESHOLD = 0.82;

// ── Stop-words stripped during normalisation ──────────────────────────────────
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'for', 'to', 'in', 'on', 'with', 'by',
]);

// ── Accepted CSV column names for title / id fields ───────────────────────────
const TITLE_COLS = ['title', 'name', 'regulation', 'regulation_title', 'reg_title'];
const ID_COLS    = ['id', 'library_id', 'reg_id'];

// ── Accepted JSON object key names for title / id fields ─────────────────────
const JSON_TITLE_KEYS = ['title', 'name', 'regulation_title', 'RegulationTitle'];
const JSON_ID_KEYS    = ['id', 'library_id', 'reg_id', 'Id'];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a raw CSV or JSON text upload from the user's regulation library.
 *
 * For CSV: auto-detects the title column and optional ID column from the
 * header row using well-known header names (case-insensitive).
 * For JSON: handles both arrays of objects and single-level objects,
 * checking a set of known key names for title and id.
 *
 * @param {string} text     - Raw file content as a string.
 * @param {string} filename - Original filename (used to detect .csv vs .json).
 * @returns {{ title: string, id: string|null }[]} Array of library items.
 */
export function parseLibraryUpload(text, filename) {
  const ext = filename.split('.').pop().toLowerCase();

  if (ext === 'json') {
    return _parseJson(text);
  }
  // Default to CSV for .csv or unknown extensions
  return _parseCsv(text);
}

function _parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  const titleIdx = headers.findIndex(h => TITLE_COLS.includes(h));
  const idIdx    = headers.findIndex(h => ID_COLS.includes(h));

  if (titleIdx === -1) return [];

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = _splitCsvRow(lines[i]);
    const title = (cols[titleIdx] || '').replace(/^["']|["']$/g, '').trim();
    if (!title) continue;
    const id = idIdx >= 0 ? (cols[idIdx] || '').replace(/^["']|["']$/g, '').trim() : null;
    results.push({ title, id: id || null });
  }
  return results;
}

/** Split a single CSV row respecting quoted fields containing commas. */
function _splitCsvRow(row) {
  const cols = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"' && !inQuote) {
      inQuote = true;
    } else if (ch === '"' && inQuote) {
      inQuote = false;
    } else if (ch === ',' && !inQuote) {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

function _parseJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed) ? parsed : Object.values(parsed);
  const results = [];

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const keys = Object.keys(item);
    const titleKey = JSON_TITLE_KEYS.find(k => keys.includes(k));
    const idKey    = JSON_ID_KEYS.find(k => keys.includes(k));
    const title = titleKey ? String(item[titleKey] || '').trim() : '';
    if (!title) continue;
    const id = idKey ? String(item[idKey] || '').trim() : null;
    results.push({ title, id: id || null });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a regulation title for fuzzy comparison.
 * Steps: lowercase → strip punctuation → remove stop words → collapse whitespace.
 *
 * @param {string} str - Raw title string.
 * @returns {string} Normalised string.
 */
export function normalise(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')           // strip punctuation
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w))    // remove stop words & empty tokens
    .join(' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the Levenshtein edit distance between two strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Edit distance (integer ≥ 0).
 */
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;

  // Use a single-row DP approach to keep memory O(n)
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost      // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a 0–1 similarity score between two strings.
 * Uses Levenshtein distance on normalised forms: 1 - (distance / max_length).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Similarity in [0, 1] where 1 = identical.
 */
export function similarity(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a newly found regulation title is already present in the
 * user's existing library, using fuzzy matching.
 *
 * @param {string} foundTitle        - Title of the regulation just discovered.
 * @param {{ title: string, id: string|null }[]} libraryItems - Existing library.
 * @param {number} [threshold]       - Similarity threshold (default: DEDUP_THRESHOLD).
 * @returns {{ isDuplicate: boolean, matchedTitle: string|null, matchedId: string|null, confidence: number }}
 */
export function checkDuplicate(foundTitle, libraryItems, threshold = DEDUP_THRESHOLD) {
  let bestScore = 0;
  let bestItem  = null;

  for (const item of libraryItems) {
    const score = similarity(foundTitle, item.title);
    if (score > bestScore) {
      bestScore = score;
      bestItem  = item;
    }
  }

  const isDuplicate = bestScore >= threshold;
  return {
    isDuplicate,
    matchedTitle: isDuplicate ? bestItem.title  : null,
    matchedId:    isDuplicate ? bestItem.id      : null,
    confidence:   Math.round(bestScore * 100),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attach a `.dedup` property to each regulation in foundRegulations by
 * comparing against the library.
 *
 * @param {{ title: string, [key: string]: any }[]} foundRegulations
 * @param {{ title: string, id: string|null }[]} libraryItems
 * @returns {Array} Same array with `.dedup` attached to each item.
 */
export function tagResults(foundRegulations, libraryItems) {
  return foundRegulations.map(reg => ({
    ...reg,
    dedup: checkDuplicate(reg.title, libraryItems),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter a tagged results array to only regulations NOT already in the library.
 *
 * @param {Array} taggedResults - Output of tagResults().
 * @returns {Array} Only items where dedup.isDuplicate === false.
 */
export function filterNew(taggedResults) {
  return taggedResults.filter(r => r.dedup && !r.dedup.isDuplicate);
}
