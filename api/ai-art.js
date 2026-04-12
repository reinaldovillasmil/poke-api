// api/ai-art.js
// On-demand art scoring with Claude vision
// Called only when user taps the "Generate Art Score" button
// Uses claude-sonnet-4-5-20241022 for vision support
// ~$0.004 per card with image

const fetch  = require('node-fetch');
const https  = require('https');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const VISION_MODEL  = 'claude-sonnet-4-5-20241022';

const ARTIST_TIERS = {
  'Mitsuhiro Arita':  {tier:'S',note:'Original Base Set artist. 2–3x collector premium vs typical artist.'},
  'Atsushi Furusawa': {tier:'S',note:'Cinematic painterly style.'},
  'Naoki Saito':      {tier:'S',note:'Dynamic compositions. Consistently outperforms at auction.'},
  'Akira Komayama':   {tier:'S',note:'Elegant romantic style. Gardevoir SIR benchmark card.'},
  'Narumi Sato':      {tier:'S',note:'Distinctive soft painterly work.'},
  'Yuka Morii':       {tier:'S',note:'Unique clay art. Major collector premium.'},
  'HYOGONOSUKE':      {tier:'A',note:'Atmospheric scenes.'},
  'Shibuzoh.':        {tier:'A',note:'Distinctive community-favorite style.'},
  'Tomokazu Komiya':  {tier:'A',note:'Clean powerful compositions.'},
  'Ryuta Fuse':       {tier:'A',note:'Dynamic action scenes.'},
  'Yusuke Ohmura':    {tier:'A',note:'Vibrant detailed environments.'},
  'Kouki Saitou':     {tier:'A',note:'Detailed illustrative style.'},
  'danciao':          {tier:'A',note:'Rising. Mega Gengar ex SAR benchmark.'},
  'Taiga Kasai':      {tier:'A',note:'Dramatic lighting.'},
  'Sanosuke Sakuma':  {tier:'A',note:'Strong character work.'},
  'Eske Yoshinob':    {tier:'A',note:'Unique vision. Growing following.'},
  '5ban Graphics':    {tier:'B',note:'3D CGI. Lower premium than painterly.'},
  'Planeta CG Works': {tier:'B',note:'3D renders. Lower collector appeal.'},
  'Ryo Ueda':         {tier:'B',note:'Professional. Moderate interest.'},
  'Kagemaru Himeno':  {tier:'B',note:'Classic TCG style.'},
};

const ART_REFS = {
  S: 'Gardevoir ex SIR by Komayama (~95 uniqueness, ~93 emotional impact), Charizard ex SIR by Naoki Saito (~92 composition), Umbreon VMAX Alt Art by Arita (~94 overall)',
  A: 'Umbreon ex SIR (~74 overall, solid portrait), Iono SIR (~78 personality), Meowscarada ex SIR (~70 energetic)',
  B: 'Gold Charizard Hyper Rare 5ban (~58, impressive but cold), standard ex Full Art (~52, professional but formulaic)',
};

function getArtistInfo(n) {
  if (!n) return null;
  for (const [k, v] of Object.entries(ARTIST_TIERS)) {
    if (n.toLowerCase().includes(k.toLowerCase())) return { name: k, ...v };
  }
  return null;
}

function fetchWithTimeout(url, opts, ms = 28000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function fetchImageBase64(imageUrl) {
  return new Promise(resolve => {
    if (!imageUrl) { resolve(null); return; }
    const timeout = setTimeout(() => resolve(null), 6000);
    https.get(imageUrl, res => {
      if (res.statusCode !== 200) { clearTimeout(timeout); resolve(null); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('base64')); });
      res.on('error', () => { clearTimeout(timeout); resolve(null); });
    }).on('error', () => { clearTimeout(timeout); resolve(null); });
  });
}

function buildFallbackArt(artist, rarity) {
  const artistInfo = getArtistInfo(artist || '');
  const base = artistInfo?.tier === 'S' ? 88 : artistInfo?.tier === 'A' ? 72 : artistInfo?.tier === 'B' ? 56 : 50;
  return {
    score:    base,
    artistTier: artistInfo?.tier || 'Unknown',
    style:    artistInfo?.tier === 'B' ? '3D CGI Render' : 'Hand-Painted Illustration',
    imageAnalyzed: false,
    dimensions: {
      composition:     { score: base - 2, note: 'Estimated from artist tier — image not analyzed' },
      colorPalette:    { score: base + 3, note: 'Estimated from artist tier' },
      emotionalImpact: { score: base - 6, note: 'Estimated from artist tier' },
      uniqueness:      { score: base - 10, note: 'Estimated from artist tier' },
      collectibility:  { score: base,     note: 'Based on documented artist market premium' },
    },
    communityReception: artistInfo?.tier === 'S' ? 'Highly Acclaimed' : artistInfo?.tier === 'A' ? 'Well Received' : 'Neutral',
    standoutFeature: artistInfo?.note || '',
    weakness: '',
    reasoning: artistInfo
      ? `${artistInfo.name} is a Tier ${artistInfo.tier} artist — ${artistInfo.note} Scores estimated from artist reputation as image analysis was unavailable.`
      : `Artist not in tier database. Scores estimated from rarity tier only.`,
    artistInfo,
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { name, rarity, artist, imageUrl } = req.query;
  if (!name) { res.status(400).json({ success: false, error: 'Missing ?name=' }); return; }

  const apiKey     = process.env.ANTHROPIC_API_KEY;
  const artistInfo = getArtistInfo(artist || '');

  if (!apiKey) {
    return res.status(200).json({
      success: true, isFallback: true,
      artScore: buildFallbackArt(artist, rarity),
      note: 'Add ANTHROPIC_API_KEY to Vercel env vars.',
    });
  }

  // Fetch image for vision
  const decodedUrl  = imageUrl ? decodeURIComponent(imageUrl) : null;
  const imageBase64 = decodedUrl ? await fetchImageBase64(decodedUrl) : null;
  const hasImage    = !!imageBase64;
  const artRef      = ART_REFS[artistInfo?.tier || 'B'];

  const prompt = `You are a Pokémon TCG art critic and investment analyst. Return ONLY valid JSON — no markdown.

RULES:
1. Score each dimension INDEPENDENTLY — genuinely different scores. A card can be 90 composition but 52 uniqueness.
2. Be critical and specific. Reference what you actually ${hasImage ? 'see in the image' : 'know about this artist and card'}.
3. Do not default everything to mid-range scores — take a real position.

CARD: ${name} | Artist: ${artist || 'Unknown'}${artistInfo ? ` (Tier ${artistInfo.tier})` : ''} | Rarity: ${rarity || 'Unknown'}
${hasImage ? 'IMAGE ATTACHED — evaluate the ACTUAL artwork.' : 'No image — estimate from artist tier but still differentiate scores.'}

CALIBRATION ANCHORS (Tier ${artistInfo?.tier || 'B'}):
${artRef}

JSON:
{
  "score": 0,
  "artistTier": "${artistInfo?.tier || 'Unknown'}",
  "style": "Painterly|3D CGI|Digital Illustration|Watercolor|Clay|Manga",
  "imageAnalyzed": ${hasImage},
  "dimensions": {
    "composition":     {"score": 0, "note": "Specific: framing, focal point, use of space."},
    "colorPalette":    {"score": 0, "note": "Specific: harmony, mood, contrast, vibrancy."},
    "emotionalImpact": {"score": 0, "note": "Does this evoke feeling? Is the subject compelling?"},
    "uniqueness":      {"score": 0, "note": "Fresh depiction vs standard pose? Compare to other versions of this character."},
    "collectibility":  {"score": 0, "note": "Will collectors seek this artwork in 5 years?"}
  },
  "communityReception": "Highly Acclaimed|Well Received|Neutral|Polarizing",
  "standoutFeature": "Best aspect in 10 words max.",
  "weakness": "Biggest weakness in 10 words max, or empty string.",
  "reasoning": "2-3 sentences synthesizing the scores. Be specific about what you ${hasImage ? 'saw' : 'know'}."
}`;

  const messageContent = hasImage
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: prompt },
      ]
    : prompt;

  try {
    const response = await fetchWithTimeout(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      VISION_MODEL,
        max_tokens: 900,
        messages:   [{ role: 'user', content: messageContent }],
      }),
    }, 28000);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data    = await response.json();
    const raw     = (data.content?.[0]?.text || '').trim();
    if (!raw)     throw new Error('Empty response');

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const s       = cleaned.indexOf('{');
    const e       = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) throw new Error('No JSON in response');

    const result = JSON.parse(cleaned.slice(s, e + 1));

    // Compute weighted composite if score is 0
    const dims = result.dimensions || {};
    if (!result.score || result.score === 0) {
      result.score = Math.round(
        (dims.composition?.score     || 0) * 0.20 +
        (dims.colorPalette?.score    || 0) * 0.15 +
        (dims.emotionalImpact?.score || 0) * 0.20 +
        (dims.uniqueness?.score      || 0) * 0.25 +
        (dims.collectibility?.score  || 0) * 0.20
      );
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    res.status(200).json({
      success:      true,
      isFallback:   false,
      imageAnalyzed: hasImage,
      artScore:     { ...result, artistInfo },
      generatedAt:  new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/ai-art]', err.message);
    res.setHeader('Cache-Control', 's-maxage=300');
    res.status(200).json({
      success:    true,
      isFallback: true,
      artScore:   buildFallbackArt(artist, rarity),
      error:      err.message,
    });
  }
};
