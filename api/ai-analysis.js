// api/ai-analysis.js
// GET /api/ai-analysis?id=sv7-169
// Calls Claude to generate:
//   - Investment thesis (4 sentences, specific to this card)
//   - Art score (artist tier + style + uniqueness + community reception)
//   - Reprint risk assessment (low/medium/high + reasoning)
// All three in one API call to minimize latency and cost.
// Cached 24 hours — analysis doesn't need to refresh constantly.

const fetch = require('node-fetch');
const { normalizeCard } = require('../lib/poketcg');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

// Artist tier list — based on collector market premiums and documented sales data
const ARTIST_TIERS = {
  // Tier S — commands significant premiums, collectors chase specifically
  'Mitsuhiro Arita': { tier: 'S', note: 'Original Base Set artist. Massive nostalgia premium. Cards appreciate 2-3x vs similar artist.' },
  'Atsushi Furusawa': { tier: 'S', note: 'Known for cinematic painterly style. High collector demand.' },
  'Naoki Saito': { tier: 'S', note: 'Fan favorite for dynamic compositions. Cards consistently outperform at auction.' },
  'Akira Komayama': { tier: 'S', note: 'Elegant romantic style. Gardevoir SIR widely cited as one of most beautiful modern cards.' },
  'Narumi Sato': { tier: 'S', note: 'Distinctive soft painterly work. Strong collector following.' },
  'Yuka Morii': { tier: 'S', note: 'Clay art style is completely unique in TCG. Major premium for this aesthetic.' },
  // Tier A — well regarded, consistent premiums
  'HYOGONOSUKE': { tier: 'A', note: 'Known for atmospheric scenes. Collector favorite.' },
  'Shibuzoh.': { tier: 'A', note: 'Distinctive style with strong community following.' },
  'Tomokazu Komiya': { tier: 'A', note: 'Clean powerful compositions. Consistent collector interest.' },
  'Ryuta Fuse': { tier: 'A', note: 'Dynamic action scenes. Popular with competitive and collector community.' },
  'Yusuke Ohmura': { tier: 'A', note: 'Vibrant colors and detailed environments. Well regarded.' },
  'Kouki Saitou': { tier: 'A', note: 'Detailed illustrative style. Solid collector following.' },
  'Eske Yoshinob': { tier: 'A', note: 'Unique artistic vision. Growing collector following.' },
  'Sanosuke Sakuma': { tier: 'A', note: 'Strong character work. Consistent auction performance.' },
  'danciao': { tier: 'A', note: 'Rising artist. Mega Gengar ex SAR generated enormous demand.' },
  'Taiga Kasai': { tier: 'A', note: 'Dramatic lighting and composition. Collector favorite.' },
  // Tier B — solid, professional, market rate
  '5ban Graphics': { tier: 'B', note: '3D CGI style. Professional but lower collector premium vs illustration. Gold hyper rares are 5ban.' },
  'Planeta CG Works': { tier: 'B', note: 'Clean 3D renders. Lower collector appeal vs painterly styles.' },
  'Ryo Ueda': { tier: 'B', note: 'Clean professional work. Moderate collector interest.' },
  'Kagemaru Himeno': { tier: 'B', note: 'Classic TCG style. Nostalgic for veteran collectors.' },
  'Hitoshi Ariga': { tier: 'B', note: 'Manga-influenced style. Moderate collector following.' },
};

function getArtistInfo(artistName) {
  if (!artistName) return null;
  for (const [name, info] of Object.entries(ARTIST_TIERS)) {
    if (artistName.toLowerCase().includes(name.toLowerCase())) return { name, ...info };
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { id, name, rarity, set, artist, price, score, lifecycleLabel, benchmarks } = req.query;
  if (!name) { res.status(400).json({ success: false, error: 'Missing ?name=' }); return; }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    res.status(200).json({
      success: true,
      cached: false,
      thesis: null,
      artScore: null,
      reprintRisk: null,
      note: 'ANTHROPIC_API_KEY not configured. Add to Vercel env vars.',
    });
    return;
  }

  const artistInfo = getArtistInfo(artist || '');

  const prompt = `You are an expert Pokémon TCG investment analyst with deep knowledge of the collector market, price history, and artistic value. Analyze this card and return a JSON response only.

CARD DETAILS:
- Name: ${name}
- Rarity: ${rarity || 'Unknown'}
- Set: ${set || 'Unknown'}
- Artist: ${artist || 'Unknown'}
- Current Market Price: ${price ? '$' + price : 'Unknown'}
- Investment Score: ${score || 'Unknown'}/100
- Lifecycle Stage: ${lifecycleLabel || 'Unknown'}
- Floor / Fair Value / Ceiling: $${benchmarks ? JSON.parse(benchmarks).floor : '?'} / $${benchmarks ? JSON.parse(benchmarks).fair : '?'} / $${benchmarks ? JSON.parse(benchmarks).ceil : '?'}
- Artist Known Data: ${artistInfo ? JSON.stringify(artistInfo) : 'Unknown artist — no documented premium data'}

Return ONLY valid JSON in this exact structure, no other text:
{
  "thesis": "4 sentences max. Specific investment reasoning for THIS card — reference the lifecycle stage, price vs benchmarks, Pokémon popularity, and any comparable cards that have followed similar trajectories. Be direct about whether to buy, wait, or avoid.",
  "artScore": {
    "score": <0-100 integer>,
    "artistTier": "<S|A|B|C|Unknown>",
    "style": "<Painterly|3D Render|Digital Illustration|Clay|Manga|Other>",
    "uniqueness": "<High|Medium|Low>",
    "communityReception": "<Highly Acclaimed|Well Received|Neutral|Polarizing>",
    "reasoning": "2 sentences explaining the art score. Reference the artist, style, and how this compares to other cards by the same artist."
  },
  "reprintRisk": {
    "level": "<Low|Medium|High|Very High>",
    "score": <0-100 integer where 100 = certain reprint>,
    "reasoning": "2-3 sentences. Reference: how recently this Pokemon/trainer appeared in a SIR, The Pokemon Company's pattern of reprinting this character, whether there's an English equivalent of a JP card, and any announced sets.",
    "factors": ["factor1", "factor2", "factor3"]
  }
}`;

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic API ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const analysis = JSON.parse(jsonMatch[0]);

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    res.status(200).json({
      success: true,
      cardId: id,
      cardName: name,
      artistInfo,
      ...analysis,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/ai-analysis]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
