/**
 * GET /api/logs  — returns recent request logs from Upstash Redis
 * Protected by the same PROXY_TOKEN as /api/search
 */
import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const PROXY_TOKEN = (process.env.PROXY_TOKEN || '').trim();
  const auth = req.headers['authorization'] || '';
  if (!PROXY_TOKEN || auth !== `Bearer ${PROXY_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return res.status(503).json({ error: 'Logging not configured.' });
  }

  const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const limit = Math.min(parseInt(req.query.limit || '200'), 500);
  const raw   = await redis.lrange('reg:logs', 0, limit - 1);
  const logs  = raw.map(entry => typeof entry === 'string' ? JSON.parse(entry) : entry);

  const total   = await redis.llen('reg:logs');
  const success = logs.filter(l => l.status === 'ok').length;
  const errors  = logs.filter(l => l.status === 'error').length;

  return res.status(200).json({ total, success, errors, logs });
}
