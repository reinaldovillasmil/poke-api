// api/ai-analysis.js
// GET /api/ai-analysis?name=...&rarity=...&set=...&artist=...&price=...
//     &score=...&lifecycleLabel=...&floor=...&fair=...&ceil=...&peak=...
//
// Uses Google Gemini API (free tier — 15 req/min, 1M tokens/day)
// Add GEMINI_API_KEY to Vercel environment variables.
// Get a free key at: aistudio.google.com
// Cached 24 hours per card.

const fetch = require('node-fetch');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const ARTIST_TIERS = {
  'Mitsuhiro Arita':  { tier:'S', note:'Original Base Set artist. Massive nostalgia premium. 2–3x vs typical artist.' },
  'Atsushi Furusawa': { tier:'S', note:'Cinematic painterly style. High collector demand.' },
  'Naoki Saito':      { tier:'S', note:'Fan favorite for dynamic compositions. Consistently outperforms at auction.' },
  'Akira Komayama':   { tier:'S', note:'Elegant romantic style. Gardevoir SIR widely cited as one of the most beautiful modern cards.' },
  'Narumi Sato':      { tier:'S', note:'Distinctive soft painterly work. Strong collector following.' },
  'Yuka Morii':       { tier:'S', note:'Unique clay art style. Major premium for this aesthetic.' },
  'HYOGONOSUKE':      { tier:'A', note:'Atmospheric scenes. Collector favorite.' },
  'Shibuzoh.':        { tier:'A', note:'Distinctive style with strong community following.' },
  'Tomokazu Komiya':  { tier:'A', note:'Clean powerful compositions. Consistent collector interest.' },
  'Ryuta Fuse':       { tier:'A', note:'Dynamic action scenes. Popular with collectors.' },
  'Yusuke Ohmura':    { tier:'A', note:'Vibrant colors and detailed environments.' },
  'Kouki Saitou':     { tier:'A', note:'Detailed illustrative style. Solid following.' },
  'danciao':          { tier:'A', note:'Rising artist. Mega Gengar ex SAR generated enormous demand.' },
  'Taiga Kasai':      { tier:'A', note:'Dramatic lighting and composition.' },
  'Sanosuke Sakuma':  { tier:'A', note:'Strong character work. Consistent auction performance.' },
  'Eske Yoshinob':    { tier:'A', note:'Unique artistic vision. Growing following.' },
  '5ban Graphics':    { tier:'B', note:'3D CGI style. Professional but lower collector premium than painterly illustration.' },
  'Planeta CG Works': { tier:'B', note:'Clean 3D renders. Lower collector appeal vs painterly.' },
  'Ryo Ueda':         { tier:'B', note:'Clean professional work. Moderate collector interest.' },
  'Kagemaru Himeno':  { tier:'B', note:'Classic TCG style. Nostalgic for veteran collectors.' },
};

function getArtistInfo(artistName) {
  if (!artistName) return null;
  for (const [name, info] of Object.entries(ARTIST_TIERS)) {
    if (artistName.toLowerCase().includes(name.toLowerCase())) return { name, ...info };
  }
  return null;
}

function fetchWithTimeout(url, options, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const {
    name, rarity, set, artist, price, score,
    lifecycleLabel, floor, fair, ceil, peak,
  } = req.query;

  if (!name) { res.status(400).json({ success: false, error: 'Missing ?name=' }); return; }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    res.status(200).json({
      success: false,
      error: 'GEMINI_API_KEY not set. Add it to Vercel environment variables. Get a free key at aistudio.google.com.',
      thesis: null, artScore: null, reprintRisk: null,
    });
    return;
  }

  const artistInfo = getArtistInfo(artist || '');

  const prompt = `You are an expert Pokémon TCG investment analyst with deep knowledge of the collector market, price history, and artistic value. Analyze this card and return ONLY a valid JSON object — no markdown fences, no explanation, just raw JSON.

CARD DETAILS:
- Name: ${name}
- Rarity: ${rarity || 'Unknown'}
- Set: ${set || 'Unknown'}
- Artist: ${artist || 'Unknown'}${artistInfo ? ` (Tier ${artistInfo.tier} artist — ${artistInfo.note})` : ' (artist tier unknown)'}
- Current Market Price: ${price ? '$' + parseFloat(price).toFixed(2) : 'Unknown'}
- Investment Score: ${score || '?'}/100
- Lifecycle Stage: ${lifecycleLabel || 'Unknown'}
- Benchmarks: Floor $${floor||'?'} / Fair Value $${fair||'?'} / Ceiling $${ceil||'?'} / Peak Comp $${peak||'?'}

Return this exact JSON structure with no additional text:
{
  "thesis": "4 sentences maximum. Specific investment reasoning for THIS card. Reference the lifecycle stage, price vs benchmarks, Pokemon popularity, and name a comparable card that followed a similar trajectory. Be direct about whether to buy, wait, or avoid and exactly why.",
  "artScore": {
    "score": 75,
    "artistTier": "A",
    "style": "Painterly",
    "uniqueness": "High",
    "communityReception": "Well Received",
    "reasoning": "2 sentences on this specific artwork quality and how the artist tier affects long-term collector demand for this card."
  },
  "reprintRisk": {
    "level": "Low",
    "score": 20,
    "reasoning": "2-3 sentences. Reference how frequently this specific Pokemon or trainer has appeared in SIRs recently, any announced sets, and whether a JP-exclusive card might get an EN equivalent.",
    "factors": ["Specific factor 1", "Specific factor 2"]
  }
}`;

  try {
    const response = await fetchWithTimeout(
      `${GEMINI_URL}?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 900,
            responseMimeType: 'application/json',
          },
        }),
      },
      20000
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();

    // Extract text from Gemini response structure
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!raw) throw new Error('Empty response from Gemini');

    // Clean and parse — strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) throw new Error('No JSON object found in Gemini response');

    const analysis = JSON.parse(cleaned.slice(s, e + 1));

    // Validate required fields
    if (!analysis.thesis) throw new Error('Missing thesis in response');

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    res.status(200).json({
      success: true,
      cardName: name,
      artistInfo,
      thesis:       analysis.thesis      || null,
      artScore:     analysis.artScore    || null,
      reprintRisk:  analysis.reprintRisk || null,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/ai-analysis]', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      thesis: null,
      artScore: null,
      reprintRisk: null,
    });
  }
};