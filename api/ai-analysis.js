// api/ai-analysis.js
// Investment thesis + reprint risk via Claude Haiku (fast, cheap)
// Art scoring is on-demand via separate button (api/ai-art.js)
// Always returns something useful — never a blank error screen

const fetch = require('node-fetch');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const ARTIST_TIERS = {
  'Mitsuhiro Arita':  {tier:'S',note:'Original Base Set artist. Massive nostalgia premium. 2–3x vs typical artist.'},
  'Atsushi Furusawa': {tier:'S',note:'Cinematic painterly style. High collector demand.'},
  'Naoki Saito':      {tier:'S',note:'Fan favorite for dynamic compositions. Consistently outperforms at auction.'},
  'Akira Komayama':   {tier:'S',note:'Elegant romantic style. Gardevoir SIR is one of the most beautiful modern cards.'},
  'Narumi Sato':      {tier:'S',note:'Distinctive soft painterly work. Strong collector following.'},
  'Yuka Morii':       {tier:'S',note:'Unique clay art style. Major premium for this aesthetic.'},
  'HYOGONOSUKE':      {tier:'A',note:'Atmospheric scenes. Collector favorite.'},
  'Shibuzoh.':        {tier:'A',note:'Distinctive style with strong community following.'},
  'Tomokazu Komiya':  {tier:'A',note:'Clean powerful compositions.'},
  'Ryuta Fuse':       {tier:'A',note:'Dynamic action scenes. Popular with collectors.'},
  'Yusuke Ohmura':    {tier:'A',note:'Vibrant colors and detailed environments.'},
  'Kouki Saitou':     {tier:'A',note:'Detailed illustrative style.'},
  'danciao':          {tier:'A',note:'Rising artist. Mega Gengar ex SAR generated enormous demand.'},
  'Taiga Kasai':      {tier:'A',note:'Dramatic lighting and composition.'},
  'Sanosuke Sakuma':  {tier:'A',note:'Strong character work. Consistent auction performance.'},
  'Eske Yoshinob':    {tier:'A',note:'Unique artistic vision. Growing following.'},
  '5ban Graphics':    {tier:'B',note:'3D CGI. Lower collector premium than painterly illustration.'},
  'Planeta CG Works': {tier:'B',note:'Clean 3D renders. Lower collector appeal.'},
  'Ryo Ueda':         {tier:'B',note:'Clean professional work. Moderate collector interest.'},
  'Kagemaru Himeno':  {tier:'B',note:'Classic TCG style. Nostalgic for veteran collectors.'},
};

function matchesName(cardName, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + escaped + '\\b', 'i').test(cardName);
}

function getArtistInfo(n) {
  if (!n) return null;
  for (const [k, v] of Object.entries(ARTIST_TIERS)) {
    if (matchesName(n, k)) return { name: k, ...v };
  }
  return null;
}

function fetchWithTimeout(url, opts, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function buildFallback(name, artist, price, lifecycleLabel, floor, fair, ceil) {
  const mkt = parseFloat(price) || 0;
  const fv  = parseFloat(fair)  || 0;
  const flr = parseFloat(floor) || 0;
  const cl  = parseFloat(ceil)  || 0;
  const inBuy  = (lifecycleLabel || '').includes('BUY');
  const tooNew = /wait|new|dropping/i.test(lifecycleLabel || '');

  let thesis = '';
  if (inBuy && mkt > 0 && mkt < fv) {
    thesis = `${name} is in the buy zone at $${mkt.toFixed(2)}, trading ${Math.round((fv-mkt)/fv*100)}% below its estimated fair value of $${fv}. This lifecycle stage historically precedes recovery as pack supply tightens and collectors begin accumulating. The risk/reward favors entry at current prices. Target: fair value $${fv}, ceiling $${cl}.`;
  } else if (tooNew) {
    thesis = `${name} at $${mkt.toFixed(2)} is too early in its lifecycle. Prices typically drop 20–40% in the first 3 months as supply floods the market. Set a price alert near the floor ($${flr}) and wait for the trough.`;
  } else if (mkt > 0 && fv > 0 && mkt > fv * 1.1) {
    thesis = `${name} at $${mkt.toFixed(2)} is above its estimated fair value of $${fv}. Not a strong entry point. Wait for a pullback toward $${flr} — the thesis only works at the right price.`;
  } else if (mkt > 0) {
    thesis = `${name} trades at $${mkt.toFixed(2)} with floor $${flr} and fair value $${fv}. Watch eBay sold data for price direction before committing. Entry near the floor provides the strongest risk/reward.`;
  } else {
    thesis = `${name} has no current price data. Check eBay sold listings to establish the real market price before evaluating. The investment thesis cannot be fully assessed without a price anchor.`;
  }

  const highRisk = ['Charizard','Pikachu','Eevee','Mewtwo','Gardevoir'];
  const lowRisk  = ['Cynthia','Misty','Lillie','Brock','Lugia','Umbreon'];
  const isH = highRisk.some(p => name.includes(p));
  const isL = lowRisk.some(p => name.includes(p));

  return {
    success:    true,
    isFallback: true,
    thesis,
    comparable: null,
    reprintRisk: {
      level:    isH ? 'High' : isL ? 'Low' : 'Medium',
      score:    isH ? 72 : isL ? 18 : 42,
      reasoning: isH
        ? `${name.split(' ')[0]} has appeared in multiple SIRs in the SV era. Each new version competes with existing ones, suppressing appreciation vs lower-reprint characters.`
        : isL
        ? `${name.split(' ')[0]} appears infrequently in SIR format. Trainer SIRs of popular characters rarely see direct reprints and tend to appreciate independently.`
        : `Moderate risk. A new SIR of the same character typically causes a 15–30% price dip in existing versions before both recover.`,
      factors: isH
        ? ['Multiple SIRs in SV era','High demand drives frequent reprints']
        : ['Monitor JP set announcements','Each version appreciates independently'],
    },
    artistInfo: getArtistInfo(artist || ''),
    artScore:   null,
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { name, rarity, set, artist, price, score, lifecycleLabel, floor, fair, ceil, peak, characterNotes, collectorTier, cardNumber } = req.query;
  if (!name) { res.status(400).json({ success: false, error: 'Missing ?name=' }); return; }

  const apiKey     = process.env.ANTHROPIC_API_KEY;
  const artistInfo = getArtistInfo(artist || '');
  const firstName  = (name || '').split(' ')[0];

  if (!apiKey) {
    console.log(`[ai-analysis] No ANTHROPIC_API_KEY — fallback for: ${name}`);
    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json({
      ...buildFallback(name, artist, price, lifecycleLabel, floor, fair, ceil),
      note: 'Add ANTHROPIC_API_KEY to Vercel environment variables.',
    });
  }

  const prompt = `You are a Pokémon TCG collector and investment analyst. Write a candid, specific take on this exact card — not a template, not a category analysis. Return ONLY valid JSON, no markdown.

CARD DETAILS:
- Full name: ${name}
- Rarity: ${rarity || 'Unknown'}
- Set: ${set || 'Unknown'}${cardNumber ? ` (card ${cardNumber})` : ''}
- Artist: ${artist || 'Unknown'}${artistInfo ? ` — ${artistInfo.note}` : ''}
- Current market price: ${price ? '$' + parseFloat(price).toFixed(2) : 'no price data'}
- Investment score: ${score || '?'}/100
- Lifecycle stage: ${lifecycleLabel || 'Unknown'}
- Estimated benchmarks: Floor $${floor||'?'} / Fair $${fair||'?'} / Ceiling $${ceil||'?'} / Peak $${peak||'?'}${characterNotes ? `\n- Character context: ${characterNotes}` : ''}${collectorTier ? `\n- Collector tier: ${collectorTier}` : ''}

Write a thesis that covers:
1. What makes THIS specific version of ${firstName} interesting or not — the art treatment, the set it's from, the character's place in the franchise, anything that distinguishes this card from other versions of the same character
2. Whether the current price makes sense given real collector demand for this specific card (not just the rarity bucket)
3. A direct, honest verdict — what should a collector actually do right now, and what would change your view

AVOID: rigid formulas, rephrasing the benchmark numbers without adding insight, phrases like "risk-reward favors entry" or "multiple price levels ahead", generic artist tier labels, or anything that could apply equally to every card of this rarity.

Return ONLY this JSON:
{
  "thesis": "<3-5 sentences of specific, candid analysis about this exact card. Be direct and concrete — name what's actually interesting or concerning.>",
  "comparable": {
    "name": "<A real card you are certain exists, with the exact name. Empty string if any doubt — do not guess.>",
    "reason": "<One sentence on why it's comparable — same character archetype, similar price history, or analogous market position.>",
    "tcgplayerUrl": "https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(firstName)}&view=grid"
  },
  "reprintRisk": {
    "level": "<Low or Medium or High or Very High>",
    "score": <0-100>,
    "reasoning": "<2 sentences specific to this character — how often has ${firstName} appeared in SIRs or SARs? What does that history say about this version's long-term value?>",
    "factors": ["<Specific factor 1>", "<Specific factor 2>"]
  }
}`;

  try {
    const response = await fetchWithTimeout(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 900,
        messages:   [{ role: 'user', content: prompt }],
      }),
    }, 25000);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data    = await response.json();
    const raw     = (data.content?.[0]?.text || '').trim();
    if (!raw)     throw new Error('Empty response from Claude');

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const s       = cleaned.indexOf('{');
    const e       = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) throw new Error('No JSON in response');

    const jsonStr = cleaned.slice(s, e + 1);
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      // Claude sometimes writes literal newlines inside JSON strings — collapse them
      result = JSON.parse(jsonStr.replace(/[\n\r]/g, ' '));
    }
    if (!result.thesis) throw new Error('Missing thesis');

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    res.status(200).json({
      success:     true,
      isFallback:  false,
      cardName:    name,
      artistInfo,
      thesis:      result.thesis,
      comparable:  result.comparable  || null,
      reprintRisk: result.reprintRisk || null,
      artScore:    null,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/ai-analysis]', err.message);
    res.setHeader('Cache-Control', 's-maxage=300');
    res.status(200).json({
      ...buildFallback(name, artist, price, lifecycleLabel, floor, fair, ceil),
      errorNote: `Claude failed: ${err.message}. Showing rule-based analysis.`,
    });
  }
};