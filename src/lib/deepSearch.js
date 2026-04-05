/**
 * @fileoverview Deep-search module that uses the Anthropic API with built-in
 * web_search tool to discover binding financial-services regulations beyond
 * what the local scraper indexes.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4000;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the system prompt instructing Claude to return only binding
 * regulations that are not already in the user's library.
 *
 * @param {string[]} knownTitles - Titles already in the library (to exclude).
 * @returns {string}
 */
function buildSystemPrompt(knownTitles) {
  const exclusionList =
    knownTitles.length > 0
      ? `\n\nDo NOT include any regulation whose title closely matches any of the following (already in library):\n${knownTitles.map(t => `- ${t}`).join('\n')}`
      : '';

  return `You are a specialist regulatory intelligence assistant. Your task is to search the web and identify legally BINDING financial-services regulations.

Rules:
1. Only return legally BINDING regulations — primary legislation, statutory instruments, final rules, or enforceable prudential standards.
2. Do NOT include guidance papers, consultation documents, discussion papers, non-binding recommendations, or speeches.
3. Cover these sectors: banking, consumer credit, AML/CFT, payments, prudential, securities, and insurance.
4. Search thoroughly across multiple regulators and jurisdictions relevant to the query.${exclusionList}

Return ONLY a raw JSON array (no markdown fences, no preamble, no commentary). Each object must have exactly these fields:
{
  "title": string,
  "type": string,
  "authority": string,
  "jurisdiction": string,
  "region": string (one of: "Global", "UK/EU", "AMER", "APAC", "ME/AF"),
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

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the final text content from an Anthropic multi-turn response.
 * The API may return tool_use blocks before the final assistant text block.
 *
 * @param {Object} responseBody - Parsed JSON response body from the Anthropic API.
 * @returns {string} The text content of the final assistant message.
 */
function extractText(responseBody) {
  const content = responseBody.content || [];
  // Find last text block (tool_use blocks come before it)
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i].type === 'text') {
      return content[i].text || '';
    }
  }
  return '';
}

/**
 * Parse the JSON array from the assistant's raw text response.
 * Extracts the first [...] match to handle any stray preamble.
 *
 * @param {string} text
 * @returns {Object[]}
 */
function parseResults(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a deep web search for binding regulations matching the query within
 * a single region/category combination.
 *
 * Retrieves the Anthropic API key from chrome.storage.local before the call.
 * Throws if no key is configured.
 *
 * @param {Object} options
 * @param {string}   options.query        - User's search query.
 * @param {string[]} options.knownTitles  - Titles already in library (excluded from results).
 * @param {string}   options.region       - Region filter (e.g. "UK/EU"). "Global" = all regions.
 * @param {string}   options.category     - Category filter (e.g. "Banking"). "All" = all categories.
 * @returns {Promise<Object[]>} Array of regulation objects.
 */
export async function deepSearch({ query, knownTitles = [], region = 'Global', category = 'All', apiKey }) {
  // Accept apiKey directly, or fall back to chrome.storage.local
  let anthropicApiKey = apiKey;
  if (!anthropicApiKey && typeof chrome !== 'undefined' && chrome.storage) {
    ({ anthropicApiKey } = await chrome.storage.local.get('anthropicApiKey'));
  }
  if (!anthropicApiKey) {
    throw new Error('No Anthropic API key set. Enter your key in the scanner settings.');
  }

  const regionClause   = region !== 'Global' ? ` in the ${region} region` : '';
  const categoryClause = category !== 'All'  ? ` related to ${category}` : '';
  const userMessage    = `Find all currently binding financial-services regulations${regionClause}${categoryClause} that match: "${query}". Search authoritative regulator websites and official legal databases. Return the full JSON array.`;

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(knownTitles),
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
      },
    ],
    messages: [
      { role: 'user', content: userMessage },
    ],
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = extractText(data);
  return parseResults(text);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run deep search across all individual regions (UK/EU, AMER, APAC, ME/AF)
 * sequentially, reporting progress via a callback.
 *
 * @param {Object} options
 * @param {string}    options.query        - User's search query.
 * @param {string[]}  options.knownTitles  - Titles already in library.
 * @param {string}    options.category     - Category filter.
 * @param {Function}  [options.onProgress] - Called with (regionName, resultsCount) after each region.
 * @returns {Promise<Object[]>} Combined results from all regions (sourceUrl-deduped).
 */
export async function deepSearchAllRegions({ query, knownTitles = [], category = 'All', onProgress }) {
  const regions = ['UK/EU', 'AMER', 'APAC', 'ME/AF', 'Global'];
  const allResults = [];
  const seenUrls   = new Set();

  for (const region of regions) {
    const results = await deepSearch({ query, knownTitles, region, category });
    const newResults = results.filter(r => {
      if (seenUrls.has(r.sourceUrl)) return false;
      seenUrls.add(r.sourceUrl);
      return true;
    });
    allResults.push(...newResults);
    if (typeof onProgress === 'function') {
      onProgress(region, newResults.length);
    }
  }

  return allResults;
}
