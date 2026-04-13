import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SOURCES } from '../src/lib/sources.js';
import { ADDITIONAL_AUTHORITIES } from '../src/lib/additionalAuthorities.js';
import { JURISDICTION_BANDINGS } from '../src/lib/jurisdictions.js';

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const jurisdictionTargets = Object.entries(JURISDICTION_BANDINGS)
  .filter(([, band]) => band !== '')
  .map(([jurisdiction]) => jurisdiction);

/** @type {Array<{name:string, kind:'source'|'additional'|'jurisdiction', region:string, category:string, url:string}>} */
const rows = [];

for (const s of SOURCES) {
  rows.push({
    name: s.regulator,
    kind: 'source',
    region: s.region,
    category: s.category,
    url: s.url || '',
  });
}

for (const a of ADDITIONAL_AUTHORITIES) {
  rows.push({
    name: a.name,
    kind: 'additional',
    region: a.region,
    category: 'All',
    url: '',
  });
}

for (const j of jurisdictionTargets) {
  rows.push({
    name: j,
    kind: 'jurisdiction',
    region: j,
    category: 'All',
    url: '',
  });
}

// Sort for usability
rows.sort((a, b) => a.name.localeCompare(b.name));

const header = ['name', 'kind', 'region', 'category', 'mappedUrl'].join(',');
const body = rows
  .map(r => [r.name, r.kind, r.region, r.category, r.url].map(csvEscape).join(','))
  .join('\r\n');

const outCsv = header + '\r\n' + body + '\r\n';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.join(__dirname, '..', 'scan-targets.csv');

await writeFile(outPath, outCsv, 'utf8');
process.stdout.write(outPath);

