/**
 * @fileoverview Deep-search module.
 * Calls the Vixio Reg Library proxy server, which holds the Gemini API key.
 * The extension itself never handles or stores any API credentials.
 *
 * Configure the proxy URL at build time via:
 *   VITE_PROXY_URL   (default: http://localhost:3001)
 *   VITE_PROXY_TOKEN (optional bearer token for auth)
 */

const PROXY_URL   = import.meta.env.VITE_PROXY_URL   ?? 'http://localhost:3001';
const PROXY_TOKEN = import.meta.env.VITE_PROXY_TOKEN ?? '';

const GEMINI_MODEL = 'gemini-2.0-flash';

// ── Input sanitization ────────────────────────────────────────────────────────
// Strip characters and patterns that could be used for prompt injection.
const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all|prior)/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now/gi,
  /disregard\s+(all|previous)/gi,
  /new\s+instructions?/gi,
  /override\s+(your|the)/gi,
  /<[^>]*>/g,           // HTML tags
  /[`]{3}/g,            // triple backticks
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, // control characters
];

function sanitize(str) {
  if (typeof str !== 'string') return '';
  let out = str.trim().slice(0, 200); // hard length cap
  for (const pattern of INJECTION_PATTERNS) {
    out = out.replace(pattern, '');
  }
  return out.trim();
}

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
  return responseBody?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseResults(text) {
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

// ── Core search ───────────────────────────────────────────────────────────────
/**
 * Search the web for binding regulations via the Vixio proxy → Gemini.
 * No API key required in the extension.
 */
export async function deepSearch({ query, knownTitles = [], region = 'Global', category = 'All' }) {
  const safeQuery    = sanitize(query);
  const safeRegion   = sanitize(region);
  const safeCategory = sanitize(category);

  const regionClause   = safeRegion !== 'Global' ? ` in the ${safeRegion} region` : ' across all regions';
  const categoryClause = safeCategory !== 'All'  ? ` related to ${safeCategory}` : '';
  const userMessage    = `Search the web and find all currently binding banking and financial-services regulations${regionClause}${categoryClause} matching: "${safeQuery}". Focus on official regulator websites, government legal portals, and official legal databases. Return the full JSON array as instructed.`;

  const geminiBody = {
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: buildSystemPrompt(knownTitles) }] },
    tools: [{ googleSearch: {} }],
    generationConfig: { maxOutputTokens: 4000 },
  };

  const headers = { 'Content-Type': 'application/json' };
  if (PROXY_TOKEN) headers['Authorization'] = `Bearer ${PROXY_TOKEN}`;

  const response = await fetch(`${PROXY_URL}/api/search`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(geminiBody),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Search failed (${response.status}): ${err.error || response.statusText}`);
  }

  const data = await response.json();
  return parseResults(extractText(data));
}

// ── Multi-region sweep ────────────────────────────────────────────────────────
export async function deepSearchAllRegions({ query, knownTitles = [], category = 'All', onProgress }) {
  const regions    = ['UK/EU', 'AMER', 'APAC', 'ME/AF', 'Global'];
  const allResults = [];
  const seenUrls   = new Set();

  for (const region of regions) {
    const results    = await deepSearch({ query, knownTitles, region, category });
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
