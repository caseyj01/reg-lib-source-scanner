/**
 * Vercel serverless function — wraps the Gemini proxy for /api/search
 */
import { Redis } from '@upstash/redis';

const GEMINI_MODEL   = 'gemini-2.5-flash';

async function logRequest(entry) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return;
  try {
    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    await redis.lpush('reg:logs', JSON.stringify(entry));
    await redis.ltrim('reg:logs', 0, 999); // keep last 1000 entries
  } catch { /* non-critical */ }
}
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all|prior)/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now/gi,
  /disregard\s+(all|previous)/gi,
  /new\s+instructions?/gi,
  /override\s+(your|the)/gi,
];

function containsInjection(str) {
  if (typeof str !== 'string') return false;
  return INJECTION_PATTERNS.some(p => { p.lastIndex = 0; return p.test(str); });
}

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body.';
  if (!Array.isArray(body.contents))     return 'Missing contents array.';
  for (const content of body.contents) {
    if (!Array.isArray(content?.parts)) return 'Invalid content parts.';
    for (const part of content.parts) {
      if (typeof part?.text === 'string' && containsInjection(part.text)) {
        return 'Request contains disallowed content.';
      }
    }
  }
  return null;
}

// Simple in-memory rate limiter (resets per serverless instance)
const calls = new Map();
function isRateLimited(ip) {
  const now  = Date.now();
  const hits = (calls.get(ip) || []).filter(t => now - t < 60000);
  hits.push(now);
  calls.set(ip, hits);
  return hits.length > 30;
}

let keyIndex = 0;
function nextKey(keys) {
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const PROXY_TOKEN = (process.env.PROXY_TOKEN || '').trim();
  const auth = req.headers['authorization'] || '';
  if (!PROXY_TOKEN || auth !== `Bearer ${PROXY_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Rate limit
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — please wait.' });
  }

  // Validate
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });

  // Keys
  const keys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter(Boolean).map(k => k.trim());

  if (keys.length === 0) {
    return res.status(500).json({ error: 'Server not configured.' });
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 4000;
  const authority   = req.body?.contents?.[0]?.parts?.[0]?.text?.split('\n')[0]?.replace('Regulatory authority: ', '') || 'unknown';
  const t0          = Date.now();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const key      = nextKey(keys);
      const response = await fetch(`${GEMINI_API_URL}?key=${key}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(req.body),
      });

      const data = await response.json();

      // Retry on 503 (overloaded) up to MAX_RETRIES
      if (response.status === 503 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
        continue;
      }

      if (!response.ok) {
        const errMsg = data?.error?.message || 'Gemini error';
        logRequest({ ts: new Date().toISOString(), authority, status: 'error', ms: Date.now() - t0, model: GEMINI_MODEL, error: errMsg });
        return res.status(response.status).json({ error: errMsg });
      }

      logRequest({ ts: new Date().toISOString(), authority, status: 'ok', ms: Date.now() - t0, model: GEMINI_MODEL });
      return res.status(200).json(data);
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        logRequest({ ts: new Date().toISOString(), authority, status: 'error', ms: Date.now() - t0, model: GEMINI_MODEL, error: e.message });
        return res.status(502).json({ error: 'Proxy could not reach Gemini.' });
      }
      await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
    }
  }
}
