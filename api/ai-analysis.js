// api/ai-analysis.js
// Calls Anthropic Claude via Vercel backend — works on any device.
// Uses claude-haiku-4-5 (fastest, cheapest, great for structured JSON)
// ~$0.001 per card analysis. $5 = ~5,000 analyses.
// Cached 24hrs at Vercel edge so repeat opens are free.
//
// Setup: Add ANTHROPIC_API_KEY to Vercel environment variables.
// Get key at: console.anthropic.com → API Keys → Create Key

const fetch = require('node-fetch');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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
  '5ban Graphics':    { tier:'B', note:'3D CGI style. Professional but lower collector premium than painterly.' },
  'Planeta CG Works': { tier:'B', note:'Clean 3D renders. Lower collector appeal vs painterly.' },
  'Ryo Ueda':         { tier:'B', note:'Clean professional work. Moderate collector interest.' },
  'Kagemaru Himeno':  { tier:'B', note:'Classic TCG style. Nostalgic for veteran collectors.' },
};

function getArtistInfo(artistName) {
  if (!artistName) return null;
  for (const [name, info] of Object.entries(ARTIST_TIERS)) {
    if (artistName.toLowerCase().includes(name.toLowerCase())) {
      return { name, ...info };
    }
  }
  return null;
}

function buildFallback(name, artist, price, lifecycleLabel, floor, fair, ceil) {
  const artistInfo = getArtistInfo(artist || '');
  const mkt  = parseFloat(price) || 0;
  const fv   = parseFloat(fair)  || 0;
  const flr  = parseFloat(floor) || 0;

  const inBuy = (lifecycleLabel || '').includes('BUY');
  const tooNew = (lifecycleLabel || '').includes('Wait') || (lifecycleLabel || '').includes('New');

  let thesis = '';
  if (inBuy && mkt > 0 && mkt < fv) {
    thesis = `${name} is in the buy zone at $${mkt.toFixed(2)}, below its estimated fair value of $${fv}. This lifecycle stage historically precedes price recovery as pack supply tightens. The risk/reward is favorable for accumulating at current prices. Hold target is fair value ($${fv}) with a longer-term ceiling of $${ceil || '?'}.`;
  } else if (tooNew) {
    thesis = `${name} at $${mkt.toFixed(2)} is from a set that is too new to buy. Prices typically drop 15–40% in the first 3 months before stabilizing. Set a price alert at the floor ($${flr}) and wait for the trough before entering.`;
  } else if (mkt > fv && fv > 0) {
    thesis = `${name} at $${mkt.toFixed(2)} is trading above its estimated fair value of $${fv}. This is not a strong entry point — wait for a pullback toward the $${flr} floor before buying. The thesis only works at the right price.`;
  } else {
    thesis = `${name} is trading at $${mkt.toFixed(2)} against a floor of $${flr} and fair value of $${fv}. Monitor the set lifecycle and watch for eBay price trends to confirm direction before committing. AI analysis temporarily unavailable — this is a rule-based estimate.`;
  }

  const artScore = {
    score: artistInfo?.tier === 'S' ? 92 : artistInfo?.tier === 'A' ? 78 : artistInfo?.tier === 'B' ? 60 : 52,
    artistTier: artistInfo?.tier || 'Unknown',
    style: artistInfo?.tier === 'B' ? '3D CGI Render' : 'Hand-Painted Illustration',
    uniqueness: artistInfo?.tier === 'S' ? 'High' : artistInfo?.tier === 'A' ? 'Medium' : 'Low',
    communityReception: artistInfo?.tier === 'S' ? 'Highly Acclaimed' : artistInfo?.tier === 'A' ? 'Well Received' : 'Neutral',
    reasoning: artistInfo
      ? `${artistInfo.name} is a Tier ${artistInfo.tier} artist — ${artistInfo.note} This directly affects the card's long-term collector premium.`
      : `Artist "${artist || 'Unknown'}" is not in our tier database. Score estimated from rarity tier only.`,
  };

  const highRisk = ['Charizard','Pikachu','Eevee','Mewtwo','Gardevoir'];
  const lowRisk  = ['Cynthia','Misty','Lillie','N ','Brock','Lugia','Umbreon'];
  const isHigh   = highRisk.some(p => name.includes(p));
  const isLow    = lowRisk.some(p  => name.includes(p));

  const reprintRisk = {
    level: isHigh ? 'High' : isLow ? 'Low' : 'Medium',
    score: isHigh ? 72 : isLow ? 18 : 42,
    reasoning: isHigh
      ? `${name.split(' ')[0]} appears in multiple SIRs per year — The Pokémon Company consistently reprints popular Pokémon to meet demand. Each new version competes with existing ones and can suppress appreciation.`
      : isLow
      ? `${name.split(' ')[0]} has appeared infrequently in SIR format. Trainer SIRs are rarely directly reprinted and tend to appreciate independently of new releases.`
      : `Moderate reprint risk. Monitor upcoming set announcements — a new SIR of the same Pokémon typically causes a 15–30% dip in existing versions.`,
    factors: isHigh
      ? ['Appears in 3+ SIRs in the SV era', 'High demand drives frequent reprints', 'New versions compete for the same collector dollar']
      : ['Watch JP set announcements for EN equivalents', 'Rotation does not affect collector demand'],
  };

  return { thesis, artScore, reprintRisk, artistInfo, isFallback: true };
}

function fetchWithTimeout(url, options, ms = 25000) {
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

  if (!name) {
    res.status(400).json({ success: false, error: 'Missing ?name=' });
    return;
  }

  const apiKey     = process.env.ANTHROPIC_API_KEY;
  const artistInfo = getArtistInfo(artist || '');

  // No API key — serve rule-based fallback immediately
  if (!apiKey) {
    const fb = buildFallback(name, artist, price, lifecycleLabel, floor, fair, ceil);
    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json({
      success: true, cardName: name, ...fb,
      note: 'Add ANTHROPIC_API_KEY to Vercel environment variables for AI analysis.',
    });
  }

  const prompt = `You are an expert Pokemon TCG investment analyst. Analyze this card and return ONLY a valid JSON object. No markdown fences, no preamble, just raw JSON starting with {.

STRICT ANTI-HALLUCINATION RULES:
1. NEVER invent card names, set names, prices, or sale histories. If uncertain about a specific comparable, describe the pattern in general terms instead.
2. Do NOT name other specific cards unless you are 100% certain they exist exactly as named in the official TCG.
3. Base ALL price reasoning ONLY on the benchmarks provided below — do not add external price data you may be uncertain about.
4. For the comparable card field: only name a card if you are completely certain it is real. If unsure, use a blank string and explain the archetype pattern instead.

CARD:
- Name: ${name}
- Rarity: ${rarity || 'Unknown'}
- Set: ${set || 'Unknown'}
- Artist: ${artist || 'Unknown'}${artistInfo ? ' (Tier ' + artistInfo.tier + ' — ' + artistInfo.note + ')' : ' (artist not in tier database)'}
- Market Price: ${price ? '$' + parseFloat(price).toFixed(2) : 'Unknown'}
- Investment Score: ${score || '?'}/100
- Lifecycle: ${lifecycleLabel || 'Unknown'}
- Benchmarks: Floor $${floor||'?'} / Fair $${fair||'?'} / Ceiling $${ceil||'?'} / Peak $${peak||'?'}

Return this exact JSON, fill every field:
{
  "thesis": "4 sentences. Cover: (1) what the lifecycle stage means for timing right now, (2) current price vs the provided benchmarks only — no invented data, (3) this Pokemon or trainer collector appeal in general terms, (4) clear verdict: buy now / accumulate on dips / wait for trough / avoid. Zero invented card names or prices.",
  "comparable": {
    "name": "Name of a real verified card you are 100% certain exists — like Charizard ex Special Illustration Rare or Umbreon VMAX Alternate Art. Empty string if any doubt.",
    "reason": "1 sentence why this is a relevant comparable by collector archetype or trajectory — no invented price history.",
    "tcgplayerUrl": "https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(name.split(' ')[0])}&view=grid"
  },
  "artScore": {
    "score": 75,
    "artistTier": "A",
    "style": "Painterly Illustration",
    "uniqueness": "High",
    "communityReception": "Well Received",
    "reasoning": "2 sentences on this artwork quality, style, and how artist tier affects long-term collector demand."
  },
  "reprintRisk": {
    "level": "Low",
    "score": 20,
    "reasoning": "2-3 sentences on reprint likelihood based on rarity type and how frequently this Pokemon or trainer archetype appears in SIRs. Do not cite specific unverified announcements.",
    "factors": ["Factor 1", "Factor 2"]
  }
}`;
  try {
    const response = await fetchWithTimeout(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    }, 25000);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = await response.json();
    const raw  = (data.content?.[0]?.text || '').trim();
    if (!raw) throw new Error('Empty response from Claude');

    // Robust JSON extraction — strip any accidental markdown
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) throw new Error('No JSON object in response');

    const analysis = JSON.parse(cleaned.slice(s, e + 1));
    if (!analysis.thesis) throw new Error('Missing thesis in response');

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    res.status(200).json({
      success:     true,
      cardName:    name,
      artistInfo,
      thesis:      analysis.thesis,
      artScore:    analysis.artScore    || null,
      reprintRisk: analysis.reprintRisk || null,
      isFallback:  false,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/ai-analysis]', err.message);
    // Always return something useful — never a blank screen
    const fb = buildFallback(name, artist, price, lifecycleLabel, floor, fair, ceil);
    res.setHeader('Cache-Control', 's-maxage=300');
    res.status(200).json({
      success: true, cardName: name, ...fb,
      error: err.message,
    });
  }
};