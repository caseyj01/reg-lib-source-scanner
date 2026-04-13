import XLSX from 'xlsx';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Usage:
 *   node scripts/import-scan-targets-xlsx.mjs "C:\path\to\scan-targets.xlsx"
 *
 * Output:
 *   src/reporting/data/scanTargets.sheet.json
 */

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Missing input .xlsx path.\nExample: node scripts/import-scan-targets-xlsx.mjs "C:\\\\Users\\\\me\\\\Downloads\\\\scan-targets.xlsx"');
  process.exit(1);
}

const wb = XLSX.readFile(inputPath);
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];

const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

/** @type {Array<{name:string,kind:string,region:string,category:string,mappedUrl:string}>} */
const out = rows
  .map(r => ({
    name: String(r.name || '').trim(),
    kind: String(r.kind || '').trim(),
    region: String(r.region || '').trim(),
    category: String(r.category || '').trim(),
    mappedUrl: String(r.mappedUrl || '').trim(),
  }))
  .filter(r => r.name);

const outPath = path.join(process.cwd(), 'src', 'reporting', 'data', 'scanTargets.sheet.json');
await writeFile(outPath, JSON.stringify({ sheet: sheetName, generatedAt: new Date().toISOString(), count: out.length, targets: out }, null, 2) + '\n', 'utf8');
process.stdout.write(outPath);

