const fs = require('fs');
const path = require('path');

const TOOL_RESULTS = 'C:\\Users\\chelc\\.claude\\projects\\C--Users-chelc\\120d77a6-67a1-4824-9cf5-4c5bf44222c0\\tool-results';

const files = [
  [path.join(TOOL_RESULTS, 'bgle3chz5.txt'), true],
  [path.join(TOOL_RESULTS, 'bogqmp1wr.txt'), false],
  [path.join(TOOL_RESULTS, 'bplebd3jo.txt'), false],
  [path.join(TOOL_RESULTS, 'b3akfgzx7.txt'), false],
];

function parseCSV(text) {
  const results = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') {
        row.push(field);
        if (row.some(x => x.trim())) results.push(row);
        row = []; field = '';
      }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some(x => x.trim())) results.push(row);
  }
  return results;
}

const rows = [];
const seenUrls = new Set();

for (const [fpath, hasHeader] of files) {
  const content = fs.readFileSync(fpath, 'utf8');
  const parsed = parseCSV(content);
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < parsed.length; i++) {
    const row = parsed[i];
    if (row.length < 6) continue;
    const [vertical, jxd, authority, docType, commonName, url] =
      row.map(x => x.trim().replace(/\s+/g, ' '));
    if (!url || !commonName) continue;
    const normUrl = url.replace('http://', 'https://');
    if (seenUrls.has(normUrl)) continue;
    seenUrls.add(normUrl);
    rows.push({
      vertical: vertical || 'Financial Services',
      jurisdiction: jxd,
      authority,
      documentType: docType,
      commonName,
      url,
    });
  }
}

// Just store URLs for deduplication
const urls = rows.map(r => r.url);
console.log('Total URLs:', urls.length);
console.log('First:', urls[0]);
console.log('Last:', urls[urls.length - 1]);

const outPath = 'C:\\Users\\chelc\\reg-lib-source-scanner\\src\\reporting\\data\\seedData.json';
fs.writeFileSync(outPath, JSON.stringify(urls, null, 2));
console.log('Written to', outPath);
