/**
 * @fileoverview Deep-search module.
 * Calls the Vixio Reg Library proxy server, which holds the Gemini API key.
 * The extension itself never handles or stores any API credentials.
 *
 * Configure the proxy URL at build time via:
 *   VITE_PROXY_URL   (default: http://localhost:3001)
 *   VITE_PROXY_TOKEN (optional bearer token for auth)
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? '';
const GEMINI_MODEL   = import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ── Runtime key support (Chrome extension settings) ───────────────────────────
let _storedKeyPromise;
function getStoredGeminiApiKey() {
  if (_storedKeyPromise) return _storedKeyPromise;
  _storedKeyPromise = new Promise((resolve) => {
    try {
      const storage = globalThis?.chrome?.storage?.local;
      if (!storage?.get) return resolve('');
      storage.get(['geminiApiKey'], (data) => resolve((data?.geminiApiKey || '').trim()));
    } catch {
      resolve('');
    }
  });
  return _storedKeyPromise;
}

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
function buildSystemPrompt() {
  return `You are a specialist regulatory compliance analyst for banking and financial services.

For the given regulatory authority or jurisdiction, produce a comprehensive compliance requirements matrix covering what banks and financial institutions need to follow in practice.

Rules:
1. Include a mix of binding and enforceable sources: primary legislation/acts, secondary legislation (regulations/statutory instruments/decrees/orders), binding rules in official rulebooks/handbooks, technical standards, supervisory statements, official guidance, circulars, regulatory notices, and enforceable expectations.
2. Exclude: speeches, consultations, Q&As, thematic reviews, blog posts, and press releases (unless they are explicitly a regulatory notice with enforceable requirements).
3. Cover ALL major compliance areas relevant to this authority: AML/CFT, KYC/CDD, governance & accountability, transaction monitoring, suspicious activity reporting, sanctions, consumer protection, fraud prevention, data protection, operational resilience, outsourcing, recordkeeping, capital adequacy, conduct of business — include everything this authority touches.
4. Each row is ONE specific requirement or expectation with a precise citation and real working URLs to official sources.
5. Aim for 60-100 rows covering the full breadth of this authority's remit — be thorough, do not stop at 20.
6. Search the authority's official website, legislation databases, and regulatory handbooks to find current in-force material.
7. URLs must point to the actual regulation document, section, or page — NOT to contents pages, index pages, or table-of-contents URLs (e.g. never use URLs ending in /contents or /contents/enacted).

Return ONLY a raw JSON array (no markdown, no preamble). Each object must have exactly these fields:
{
  "reqReport": "Y",
  "requirement": string,
  "description": string,
  "analystGuide": string,
  "reference": string,
  "sourceUrl1": string,
  "sourceUrl1Type": string,
  "sourceUrl2": string,
  "sourceUrl2Type": string,
  "authority": string,
  "jurisdiction": string,
  "publishedDate": string
}

Field definitions:
- requirement: compliance category (e.g. "AML Governance and Accountability", "Customer Due Diligence", "Sanctions Screening")
- description: the specific requirement or expectation in 1-2 clear sentences
- analystGuide: what evidence to look for and questions to ask during a compliance review (start with an action verb, 1-2 sentences)
- reference: exact citation (e.g. "Money Laundering Regulations 2017, Regulation 21(1)(a)" or "FCA SYSC 6.3.1R")
- sourceUrl1: URL to the primary source (legislation, rule, or official standard)
- sourceUrl1Type: short label describing the link (e.g. "Primary Legislation", "FCA Handbook", "EBA Guidelines", "Supervisory Statement", "Regulatory Notice", "Technical Standard", "Official Guidance")
- sourceUrl2: URL to secondary source (guidance, handbook chapter, or supporting document)
- sourceUrl2Type: short label describing the link (same format as sourceUrl1Type)
- authority: full official name of the regulatory authority
- jurisdiction: country or region (e.g. "United Kingdom", "European Union", "United States")
- publishedDate: the date this document was published or came into force, as printed on the document or official source page, in format "DD Mon YYYY" (e.g. "14 Jan 2024") — leave empty string if not found`
}

// KNOWN_AUTHORITIES is now a plain string array (names only)

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
export async function deepSearch({ query, region = 'Global', category = 'All', targetUrls = [] }) {
  const safeQuery    = sanitize(query);
  const safeRegion   = sanitize(region);
  const safeCategory = sanitize(category);

  const regionClause   = safeRegion !== 'Global' ? ` (${safeRegion} region)` : '';
  const categoryClause = safeCategory !== 'All'  ? `, focusing on ${safeCategory}` : '';

  const safeTargetUrls = targetUrls
    .filter(u => typeof u === 'string')
    .map(u => u.trim())
    .filter(Boolean)
    .slice(0, 8);

  const preferredSourcesClause = safeTargetUrls.length > 0
    ? `\n\nPreferred official sources (use these first; do not invent other "official" sites):\n${safeTargetUrls.map(u => `- ${u}`).join('\n')}`
    : '';

  const userMessage = `Regulatory authority: ${safeQuery}${regionClause}

Search the official website, published rulebook, handbook, and legislation of ${safeQuery}. Extract the specific compliance requirements that banks and financial institutions must meet${categoryClause}.

Include: primary legislation, secondary legislation (regulations/statutory instruments/decrees/orders), binding rules in official handbooks/rulebooks, technical standards, supervisory statements, official guidance, circulars, regulatory notices, and enforceable expectations.

Exclude: consultation papers, speeches, Q&As, thematic reviews, Dear CEO letters, and non-binding industry guidance.

For each requirement provide a direct link to the binding source documentation. Aim for 60-100 rows covering the full breadth of this authority's remit.

If you cannot find enough material on official sites, broaden to official government legislation databases and gazettes for that jurisdiction, then to reputable legal databases that deep-link to the official text.${preferredSourcesClause}`;

  async function callGemini(messageText) {
    const geminiBody = {
      contents: [{ role: 'user', parts: [{ text: messageText }] }],
      systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
      tools: [{ googleSearch: {} }],
      generationConfig: { maxOutputTokens: 12000 },
    };

    const runtimeKey = (await getStoredGeminiApiKey()) || GEMINI_API_KEY;
    if (!runtimeKey) {
      throw new Error('Gemini API key not set. Add it in extension Settings (Gemini API Key) or set VITE_GEMINI_API_KEY at build time.');
    }

    const url = `${GEMINI_API_URL}?key=${encodeURIComponent(runtimeKey)}`;
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 1500;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(geminiBody),
      });

      // Retry on 503 overloads
      if (response.status === 503 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, BASE_DELAY_MS * attempt));
        continue;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg =
          (typeof err?.error?.message === 'string' && err.error.message) ||
          (typeof err?.message === 'string' && err.message) ||
          (typeof err?.error === 'string' && err.error) ||
          (() => {
            try { return JSON.stringify(err); } catch { return String(err); }
          })() ||
          response.statusText;
        throw new Error(`Search failed (${response.status}) via Gemini direct (${GEMINI_MODEL}): ${msg}`);
      }

      const data = await response.json();
      return parseResults(extractText(data));
    }

    throw new Error(`Search failed (503) via Gemini direct (${GEMINI_MODEL}): model overloaded after retries`);
  }

  // Multi-pass: get a large binding-only set, then ask for additional non-overlapping rows.
  const pass1 = await callGemini(userMessage);

  const seen = new Set();
  const out = [];
  for (const r of pass1) {
    const key = `${(r?.reference || '').trim().toLowerCase()}|${(r?.sourceUrl1 || '').trim().toLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }

  if (out.length < 60) {
    const morePrompt = `${userMessage}

Now return ADDITIONAL binding requirements that do NOT overlap with the following citations/URLs (avoid duplicates):
${out.slice(0, 80).map(r => `- ${String(r.reference || '').slice(0, 140)} | ${String(r.sourceUrl1 || '').slice(0, 180)}`).join('\n')}

Return ONLY a raw JSON array with the exact same schema as before.`;

    const pass2 = await callGemini(morePrompt);
    for (const r of pass2) {
      const key = `${(r?.reference || '').trim().toLowerCase()}|${(r?.sourceUrl1 || '').trim().toLowerCase()}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }

  return out;
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
