// api/watchlist.js
// GET  /api/watchlist?uid=USER_ID          → returns watchlist card IDs
// POST /api/watchlist                       → { uid, cardId, action: 'add'|'remove' }
//
// Uses Vercel KV (free: 30k req/mo, 256MB) for cross-device sync.
// If KV isn't set up yet, falls back gracefully and tells the client.
//
// SETUP: Vercel dashboard → Storage → Create KV → Link to project.
// Env vars KV_REST_API_URL and KV_REST_API_TOKEN are injected automatically.

const fetch = require('node-fetch');

async function kvGet(url, token, key) {
  const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : [];
}

async function kvSet(url, token, key, value) {
  await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(value) }),
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    // KV not configured — tell client to use localStorage fallback
    res.status(200).json({ success: true, kvAvailable: false, watchlist: [], message: 'KV not configured. Add Vercel KV storage to enable cross-device sync.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const uid = req.query.uid || 'default';
      const watchlist = await kvGet(kvUrl, kvToken, `watchlist:${uid}`);
      res.status(200).json({ success: true, kvAvailable: true, watchlist });

    } else if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
      const { uid = 'default', cardId, action } = body || {};
      if (!cardId || !['add','remove'].includes(action)) {
        res.status(400).json({ success: false, error: 'Provide cardId and action (add|remove)' }); return;
      }
      let watchlist = await kvGet(kvUrl, kvToken, `watchlist:${uid}`);
      if (action === 'add' && !watchlist.includes(cardId)) watchlist.push(cardId);
      if (action === 'remove') watchlist = watchlist.filter(id => id !== cardId);
      await kvSet(kvUrl, kvToken, `watchlist:${uid}`, watchlist);
      res.status(200).json({ success: true, kvAvailable: true, watchlist });

    } else {
      res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
