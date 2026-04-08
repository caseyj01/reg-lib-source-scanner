# Reg Library Source Finder

A Chrome extension (Manifest V3) that scans regulatory publication pages, deduplicates results against your existing compliance library, and exports new findings to Excel.

---

## Features

- **Indexed scraping** — automatically scrapes 26 regulatory sources across UK/EU, AMER, APAC, ME/AF and Global (runs every 6 hours)
- **Fuzzy deduplication** — Levenshtein-based similarity matching (threshold 0.82) against your uploaded library
- **Deep search** — uses the Anthropic API with built-in web search to discover regulations beyond the indexed set
- **Excel export** — three-sheet `.xlsx` workbook: new findings, duplicates, summary

---

## How to Build

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/caseyj01/reg-lib-source-scanner.git
cd reg-lib-source-scanner

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build
```

The built extension will be in the `dist/` folder.

---

## Loading as an Unpacked Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder inside the project

The extension icon will appear in your toolbar. Click it to open the popup.

---

## Setting Your Anthropic API Key

Deep search uses the Anthropic API (model: `claude-sonnet-4-20250514` with built-in web search).

1. Open the extension popup
2. Click the **gear icon ⚙** in the bottom-right of the status bar
3. Paste your API key (starts with `sk-ant-…`) into the password field
4. Click **Save Key**

The key is stored locally in `chrome.storage.local` and never transmitted except directly to the Anthropic API.

Get your API key at: https://console.anthropic.com

---

## Library Upload Format

Upload your existing regulation library via the green upload bar. Accepted formats:

### CSV

The file must have a header row. The parser looks for these column names (case-insensitive):

| Field | Accepted column names |
|-------|-----------------------|
| Title | `title`, `name`, `regulation`, `regulation_title`, `reg_title` |
| ID    | `id`, `library_id`, `reg_id` (optional) |

**Example:**
```csv
regulation_title,library_id
Capital Requirements Regulation (CRR),REG-001
Markets in Financial Instruments Directive II,REG-002
Payment Services Directive 2 (PSD2),REG-003
```

### JSON

Accepts an array of objects or an object of objects. Recognised key names:

| Field | Accepted keys |
|-------|---------------|
| Title | `title`, `name`, `regulation_title`, `RegulationTitle` |
| ID    | `id`, `library_id`, `reg_id`, `Id` (optional) |

**Example (array):**
```json
[
  { "title": "Capital Requirements Regulation (CRR)", "id": "REG-001" },
  { "title": "Markets in Financial Instruments Directive II", "id": "REG-002" }
]
```

**Example (object):**
```json
{
  "crr": { "RegulationTitle": "Capital Requirements Regulation (CRR)", "Id": "REG-001" }
}
```

---

## Excel Export

Click **Export N new regulations to Excel** to download a `.xlsx` file named `Reg_Library_NewSources_YYYY-MM-DD.xlsx`.

The workbook contains three sheets:

| Sheet | Contents |
|-------|----------|
| **New Regulations Found** | All regulations not matched in your library, with full metadata and empty columns for analyst notes, review priority, and status (defaults to "Pending Review") |
| **Already In Library** | Regulations that matched an existing library entry, with match title, library ID, and confidence % |
| **Summary** | Search query, export date, counts, regions, and unique jurisdiction count |

---

## Deduplication Threshold

The similarity threshold is defined as a named constant at the top of `src/lib/dedup.js`:

```js
export const DEDUP_THRESHOLD = 0.82;
```

Increase it (e.g. `0.90`) for stricter matching; decrease it (e.g. `0.75`) to catch more near-duplicates.

---

## Regulatory Sources

The extension indexes the following 26 sources:

| Region | Regulator | Source |
|--------|-----------|--------|
| UK/EU | FCA | Policy Statements |
| UK/EU | FCA | Consultation Papers |
| UK/EU | PRA | Supervisory Statements |
| UK/EU | HM Treasury | Secondary Legislation |
| UK/EU | EBA | Regulatory Products |
| UK/EU | ECB | Supervisory Regulations |
| UK/EU | ESMA | Regulations |
| UK/EU | EUR-Lex | Financial Services |
| AMER | CFPB | Final Rules |
| AMER | OCC | Regulations |
| AMER | Federal Reserve | Regulations |
| AMER | FDIC | Rules & Regulations |
| AMER | SEC | Final Rules |
| APAC | MAS | Notices & Guidelines |
| APAC | APRA | Prudential Standards |
| APAC | ASIC | Regulatory Guides |
| APAC | RBI | Master Directions |
| APAC | HKMA | Supervisory Policy Manuals |
| ME/AF | SAMA | Regulatory Rules |
| ME/AF | UAE Central Bank | Regulations |
| ME/AF | ADGM FSRA | Regulations |
| Global | BIS / BCBS | Basel Framework |
| Global | FATF | Recommendations |
| Global | FSB | Policy Documents |
| Global | IOSCO | Standards |

---

## Project Structure

```
reg-lib-source-scanner/
├── public/
│   └── manifest.json          Chrome extension manifest
├── src/
│   ├── lib/
│   │   ├── sources.js          Regulatory source registry (26 sources)
│   │   ├── dedup.js            Fuzzy deduplication engine
│   │   ├── deepSearch.js       Anthropic API integration
│   │   └── exporter.js         Excel export (SheetJS)
│   ├── background/
│   │   └── service-worker.js   IndexedDB cache + scraper + message handler
│   ├── content/
│   │   └── content-script.js   Page regulation reference scanner
│   └── popup/
│       ├── index.html
│       ├── main.jsx
│       ├── App.jsx             Main React UI
│       └── App.css             Styles (light + dark mode)
├── package.json
├── vite.config.js
└── README.md
```
