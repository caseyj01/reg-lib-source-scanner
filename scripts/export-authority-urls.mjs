import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SOURCES } from '../src/lib/sources.js';
import { KNOWN_AUTHORITIES } from '../src/lib/authorities.js';

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build regulator -> unique urls from SOURCES
const regulatorToUrls = new Map();
for (const s of SOURCES) {
  const regulator = (s?.regulator || '').trim();
  const url = (s?.url || '').trim();
  if (!regulator || !url) continue;
  const set = regulatorToUrls.get(regulator) ?? new Set();
  set.add(url);
  regulatorToUrls.set(regulator, set);
}

// If a KNOWN_AUTHORITY exactly matches a regulator name, attach its URLs.
// Otherwise leave blank (we do NOT guess official sites).
const lines = [];
lines.push(['authority', 'urls'].map(csvEscape).join(','));

for (const authority of KNOWN_AUTHORITIES) {
  const urls = regulatorToUrls.get(authority);
  const urlList = urls ? [...urls].sort().join(' | ') : '';
  lines.push([authority, urlList].map(csvEscape).join(','));
}

const outCsv = lines.join('\r\n') + '\r\n';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.join(__dirname, '..', 'authority-urls.csv');

await writeFile(outPath, outCsv, 'utf8');
process.stdout.write(outPath);

