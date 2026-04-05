/**
 * @fileoverview Deep-search module using the Gemini API with Google Search
 * grounding to discover binding financial-services regulations on the open web.
 */

const GEMINI_MODEL   = 'gemini-2.0-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOKENS     = 4000;

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(knownTitles) {
  const exclusionList =
    knownTitles.length > 0
      ? `\n\nDo NOT include any regulation whose title closely matches:\n${knownTitles.map(t => `- ${t}`).join('\n')}`
      : '';

  return `You are a specialist regulatory intelligence assistant. Search the web and identify legally BINDING banking and financial-services regulations.

Rules:
1. Only return legally BINDING regulations — primary legislation, statutory instruments, final rules, or enforceable prudential standards.
2. Do NOT include guidance papers, consultations, discussion papers, non-binding recommendations, or speeches.
3. Cover: banking, consumer credit, AML/CFT, payments, prudential, securities, insurance.
4. Search authoritative regulator websites and official legal databases.${exclusionList}

Return ONLY a raw JSON array (no markdown, no preamble). Each object must have exactly:
{
  "title": string,
  "type": string,
  "authority": string,
  "jurisdiction": string,
  "region": string,
  "year": string,
  "lastAmended": string,
  "primaryLegRef": string,
  "sector": string,
  "subSector": string,
  "binding": boolean,
  "sourceUrl": string,
  "officialRef": string,
  "summary": string
}`;
}

// ── Response parsing ──────────────────────────────────────────────────────────
function extractText(responseBody) {
  // Gemini: candidates[0].content.parts[0].text
  return responseBody?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseResults(text) {
  // Strip markdown fences if Gemini wraps in ```json … ```
  const stripped = text.replace(/```json\s*/gi, '').replace(/```/g, '');
  const match = stripped.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Key resolution ────────────────────────────────────────────────────────────
async function resolveKey(apiKey) {
  if (apiKey) return apiKey;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise(resolve =>
      chrome.storage.local.get('geminiApiKey', d => resolve(d.geminiApiKey || ''))
    );
  }
  return localStorage.getItem('reg-api-key') || '';
}

// ── Core search ───────────────────────────────────────────────────────────────
/**
 * Search the web for binding regulations via Gemini + Google Search grounding.
 *
 * @param {Object}   options
 * @param {string}   options.query        - Search topic / query.
 * @param {string[]} options.knownTitles  - Titles to exclude (already in library).
 * @param {string}   options.region       - "Global" | "UK/EU" | "AMER" | "APAC" | "ME/AF"
 * @param {string}   options.category     - "Banking" | "All" | etc.
 * @param {string}   [options.apiKey]     - Gemini API key (falls back to storage).
 * @returns {Promise<Object[]>}
 */
export async function deepSearch({ query, knownTitles = [], region = 'Global', category = 'All', apiKey }) {
  const key = await resolveKey(apiKey);
  if (!key) throw new Error('No Gemini API key set. Enter your key (AIza…) in the scanner settings.');

  const regionClause   = region !== 'Global' ? ` in the ${region} region` : ' across all regions';
  const categoryClause = category !== 'All'  ? ` related to ${category}` : '';
  const userMessage    = `Search the web and find all currently binding banking and financial-services regulations${regionClause}${categoryClause} matching: "${query}". Focus on official regulator websites, government legal portals, and official legal databases. Return the full JSON array as instructed.`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: buildSystemPrompt(knownTitles) }] },
    tools: [{ googleSearch: {} }],
    generationConfig: { maxOutputTokens: MAX_TOKENS },
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = extractText(data);
  return parseResults(text);
}

// ── Multi-region sweep ────────────────────────────────────────────────────────
export async function deepSearchAllRegions({ query, knownTitles = [], category = 'All', onProgress, apiKey }) {
  const regions    = ['UK/EU', 'AMER', 'APAC', 'ME/AF', 'Global'];
  const allResults = [];
  const seenUrls   = new Set();

  for (const region of regions) {
    const results    = await deepSearch({ query, knownTitles, region, category, apiKey });
    const newResults = results.filter(r => {
      if (!r.sourceUrl || seenUrls.has(r.sourceUrl)) return false;
      seenUrls.add(r.sourceUrl);
      return true;
    });
    allResults.push(...newResults);
    if (typeof onProgress === 'function') onProgress(region, newResults.length);
  }

  return allResults;
}
