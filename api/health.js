// api/health.js
// GET /api/health
// Quick check to confirm the backend is up, env vars are set, and PokéTCG is reachable.

const fetch = require('node-fetch');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const start = Date.now();
  const checks = {};

  // 1. Environment variables
  checks.env = {
    poketcgApiKey: !!process.env.POKETCG_API_KEY,
    kvConfigured:  !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN,
  };

  // 2. PokéTCG.io reachability
  try {
    const headers = process.env.POKETCG_API_KEY ? { 'X-Api-Key': process.env.POKETCG_API_KEY } : {};
    const r = await fetch('https://api.pokemontcg.io/v2/cards?pageSize=1', { headers });
    checks.pokeTcgApi = { ok: r.ok, status: r.status };
  } catch (e) {
    checks.pokeTcgApi = { ok: false, error: e.message };
  }

  // 3. Vercel KV (if configured)
  if (checks.env.kvConfigured) {
    try {
      const r = await fetch(`${process.env.KV_REST_API_URL}/ping`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
      });
      checks.kv = { ok: r.ok, status: r.status };
    } catch (e) {
      checks.kv = { ok: false, error: e.message };
    }
  } else {
    checks.kv = { ok: false, note: 'Not configured — watchlist uses localStorage fallback' };
  }

  const allOk = checks.pokeTcgApi.ok;
  const latencyMs = Date.now() - start;

  res.status(allOk ? 200 : 503).json({
    status:    allOk ? 'ok' : 'degraded',
    latencyMs,
    timestamp: new Date().toISOString(),
    version:   '2.0.0',
    checks,
    endpoints: [
      'GET /api/health',
      'GET /api/cards',
      'GET /api/search?q=',
      'GET /api/score?id=',
      'GET /api/prices?q=',
      'GET /api/trending',
      'GET /api/watchlist?uid=',
      'POST /api/watchlist',
    ],
  });
};
