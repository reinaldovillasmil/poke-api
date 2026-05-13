// api/ai-art.js
// On-demand art scoring with Claude vision
// Called only when user taps the "Score Artwork" button

const fetch = require('node-fetch');
const https = require('https');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const VISION_MODEL  = 'claude-haiku-4-5-20251001';

const ARTIST_TIERS = {
  // S — benchmark-setting, 2–3x collector premium
  'Mitsuhiro Arita':    { tier:'S', note:'Original Base Set artist. Massive nostalgia premium.' },
  'Atsushi Furusawa':   { tier:'S', note:'Cinematic painterly style. Consistently strong at auction.' },
  'Naoki Saito':        { tier:'S', note:'Dynamic compositions. Charizard ex SIR is the benchmark.' },
  'Akira Komayama':     { tier:'S', note:'Romantic elegance. Gardevoir ex SIR defines the category.' },
  'Narumi Sato':        { tier:'S', note:'Distinctive soft painterly work. Major collector following.' },
  'Yuka Morii':         { tier:'S', note:'One-of-a-kind clay aesthetic. Highest collectibility tier.' },
  // A — strong artists, above-average collector premium
  'HYOGONOSUKE':        { tier:'A', note:'Atmospheric cinematic scenes with strong mood.' },
  'Shibuzoh.':          { tier:'A', note:'Distinctive fan-favourite style.' },
  'Tomokazu Komiya':    { tier:'A', note:'Clean, powerful compositions.' },
  'Ryuta Fuse':         { tier:'A', note:'Dynamic action-forward art.' },
  'Yusuke Ohmura':      { tier:'A', note:'Vibrant detailed environments.' },
  'Kouki Saitou':       { tier:'A', note:'Detailed illustrative style.' },
  'danciao':            { tier:'A', note:'Rising star. Mega Gengar ex SAR is a collector landmark.' },
  'Taiga Kasai':        { tier:'A', note:'Dramatic lighting and cinematic mood.' },
  'Sanosuke Sakuma':    { tier:'A', note:'Strong expressive character work.' },
  'Eske Yoshinob':      { tier:'A', note:'Unique artistic vision, growing community following.' },
  'Hasuno':             { tier:'A', note:'Warm expressive style, one of the most prolific modern SIR artists.' },
  'Aoji':               { tier:'A', note:'Distinctive colour work, growing collector demand.' },
  'kirisAki':           { tier:'A', note:'Clean detailed compositions with strong character presence.' },
  'Yuu Nishida':        { tier:'A', note:'Energetic character-forward art.' },
  'Nagimiso':           { tier:'A', note:'Soft pastel style, highly popular with modern collectors.' },
  'sui':                { tier:'A', note:'Detailed illustrative work, rising auction demand.' },
  'Jerky':              { tier:'A', note:'Expressive character portraits.' },
  'Kyuugou':            { tier:'A', note:'Kirlia alt art sparked major collector demand.' },
  'Mizue':              { tier:'A', note:'Elegant detailed compositions.' },
  'Wataru Kanda':       { tier:'A', note:'Strong character and environmental storytelling.' },
  'Naoyo Kimura':       { tier:'A', note:'Veteran artist with strong sustained collector following.' },
  'Teeziro':            { tier:'A', note:'Vibrant character-focused compositions.' },
  'Uninori':            { tier:'A', note:'Clean stylised art with collector appeal.' },
  'Saya Tsuruta':       { tier:'A', note:'Elegant character-focused illustration.' },
  // B — professional, moderate collector premium
  '5ban Graphics':      { tier:'B', note:'3D CGI. Lower premium than painterly illustration.' },
  'Planeta CG Works':   { tier:'B', note:'3D renders. Lower collector appeal.' },
  'Ryo Ueda':           { tier:'B', note:'Professional work, moderate collector interest.' },
  'Kagemaru Himeno':    { tier:'B', note:'Classic TCG illustration style.' },
  'Yoshinobu Saito':    { tier:'B', note:'Professional standard TCG art.' },
  'Souichirou Gunjima': { tier:'B', note:'Clean professional TCG style.' },
  'Emre Unayli':        { tier:'B', note:'Modern digital illustration.' },
  'Toshinao Aoki':      { tier:'B', note:'Veteran TCG artist, classic style.' },
  '2by2':               { tier:'B', note:'Competent digital illustration.' },
};

// Calibration anchors shown to Claude for each tier
const ART_REFS = {
  S: 'Gardevoir ex SIR by Komayama (composition ~95, uniqueness ~93, emotional ~94 overall ~92), Charizard ex SIR by Saito (composition ~92, dynamic energy ~89), Umbreon VMAX Alt Art by Arita (nostalgia ~94, overall ~91)',
  A: 'Umbreon ex SIR Hasuno (~76 overall, warm intimate portrait), Iono SIR (~78 personality, weaker composition), Meowscarada ex SIR (~71 energetic, moderate uniqueness ~63)',
  B: 'Gold Charizard Hyper Rare 5ban (~60, technically impressive but cold and formulaic), standard ex Full Art (~52, professional but generic pose)',
  Unknown: 'Score based on what you actually see. SIRs rarely score below 55 due to selection quality. Hyper Rares (gold/rainbow) often score 52–65 for art, higher for collectibility.',
};

function matchesName(cardName, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + escaped + '\\b', 'i').test(cardName);
}

function getArtistInfo(name) {
  if (!name) return null;
  for (const [k, v] of Object.entries(ARTIST_TIERS)) {
    if (matchesName(name, k)) return { name: k, ...v };
  }
  return null;
}

// Deterministic variation from card name so fallback scores differ per card
function strHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function buildFallbackArt(artist, rarity, name = '') {
  const artistInfo = getArtistInfo(artist || '');
  const hash = strHash((name || '') + (artist || ''));

  let base;
  if (artistInfo) {
    base = artistInfo.tier === 'S' ? 87 : artistInfo.tier === 'A' ? 72 : 57;
  } else {
    // Rarity-based baseline when artist is unknown
    if (rarity?.includes('Special Illustration')) base = 70;
    else if (rarity?.includes('Illustration Rare')) base = 63;
    else if (rarity?.includes('Hyper Rare'))        base = 57;
    else                                             base = 54;
    // ±8 deterministic spread so same-rarity unknowns differ
    base = clamp(base + (hash % 17) - 8, 40, 95);
  }

  const v = (offset, spread) => clamp(base + offset + ((hash >> (spread)) % spread) - Math.floor(spread / 2), 30, 99);

  return {
    score:         base,
    artistTier:    artistInfo?.tier || 'Unknown',
    style:         artistInfo?.tier === 'B' ? '3D CGI Render' : 'Hand-Painted Illustration',
    imageAnalyzed: false,
    dimensions: {
      composition:     { score: v(2,  10), note: 'Estimated — image not analyzed' },
      colorPalette:    { score: v(4,  14), note: 'Estimated from rarity tier' },
      emotionalImpact: { score: v(-5, 16), note: 'Estimated — image not analyzed' },
      uniqueness:      { score: v(-8, 18), note: 'Estimated from rarity classification' },
      collectibility:  { score: v(3,   8), note: 'Based on rarity and artist market data' },
    },
    communityReception: base >= 82 ? 'Highly Acclaimed' : base >= 68 ? 'Well Received' : base >= 56 ? 'Neutral' : 'Mixed',
    standoutFeature: artistInfo?.note || (rarity?.includes('Special Illustration') ? 'Full-art scene with character depth' : 'Rarity-tier quality illustration'),
    weakness: '',
    reasoning: artistInfo
      ? `${artistInfo.name} is a Tier ${artistInfo.tier} artist — ${artistInfo.note} Scores estimated from artist reputation (image not analyzed).`
      : `Artist not in database. Estimated from ${rarity || 'rarity'} tier and card name. Tap again with ANTHROPIC_API_KEY set for real vision analysis.`,
    artistInfo,
  };
}

function fetchWithTimeout(url, opts, ms = 28000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function detectMediaType(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.slice(0,4).toString() === 'RIFF' && buf.slice(8,12).toString() === 'WEBP') return 'image/webp';
  return 'image/jpeg'; // fallback
}

async function fetchImageBase64(imageUrl) {
  return new Promise(resolve => {
    if (!imageUrl) { resolve(null); return; }
    const timeout = setTimeout(() => resolve(null), 8000);
    const done = (val) => { clearTimeout(timeout); resolve(val); };
    https.get(imageUrl, res => {
      if (res.statusCode !== 200) { done(null); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        done({ data: buf.toString('base64'), mediaType: detectMediaType(buf) });
      });
      res.on('error', () => done(null));
    }).on('error', () => done(null));
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { name, rarity, artist, set, imageUrl } = req.query;
  if (!name) { res.status(400).json({ success: false, error: 'Missing ?name=' }); return; }

  const apiKey     = process.env.ANTHROPIC_API_KEY;
  const artistInfo = getArtistInfo(artist || '');

  if (!apiKey) {
    return res.status(200).json({
      success: true, isFallback: true,
      artScore: buildFallbackArt(artist, rarity, name),
      note: 'Add ANTHROPIC_API_KEY for vision analysis.',
    });
  }

  const decodedUrl  = imageUrl ? decodeURIComponent(imageUrl) : null;
  const imageResult = decodedUrl ? await fetchImageBase64(decodedUrl) : null;
  const hasImage    = !!imageResult;
  const imageBase64 = imageResult?.data;
  const mediaType   = imageResult?.mediaType || 'image/png';

  const tierKey = artistInfo?.tier || 'Unknown';
  const artRef  = ART_REFS[tierKey] || ART_REFS.Unknown;

  const prompt = `You are a Pokémon TCG art critic and investment analyst. Analyze this SPECIFIC card's artwork.
Return ONLY valid JSON — no markdown, no explanation outside the JSON.

CARD: "${name}" | Set: ${set || 'Unknown'} | Rarity: ${rarity || 'Unknown'} | Artist: ${artist || 'Unknown'}${artistInfo ? ` (Tier ${artistInfo.tier} — ${artistInfo.note})` : ''}
${hasImage ? 'AN IMAGE OF THIS CARD IS ATTACHED. Base your entire analysis on what you actually see.' : 'No image available. Base your analysis on what you know about this specific card and artist.'}

CALIBRATION ANCHORS for Tier ${tierKey}:
${artRef}

SCORING RULES — READ CAREFULLY:
1. Each dimension MUST be scored independently. The range across all 5 dimensions MUST span at least 20 points.
2. Reference specific visual elements: colors, pose, background, expression, lighting, composition, what makes this card's art distinct from other cards of this character.
3. Never output 50 as a default. Every score must reflect a real judgement about THIS card.
4. "collectibility" considers: will collectors specifically seek out THIS artwork in 5 years, vs other versions of this character?
5. Compare to the calibration anchors above — if this card is clearly better/worse, reflect that.

Respond with this JSON and nothing else:
{
  "score": <weighted composite 1-99, your overall art investment score>,
  "artistTier": "${artistInfo?.tier || 'Unknown'}",
  "style": "<one of: Painterly / 3D CGI / Digital Illustration / Watercolor / Clay / Manga / Acrylic>",
  "imageAnalyzed": ${hasImage},
  "dimensions": {
    "composition":     { "score": <1-99>, "note": "<specific observation about framing, focal point, use of space in THIS card>" },
    "colorPalette":    { "score": <1-99>, "note": "<specific: dominant colors, mood, contrast in THIS card>" },
    "emotionalImpact": { "score": <1-99>, "note": "<does THIS art evoke feeling? Is the subject expression compelling?>" },
    "uniqueness":      { "score": <1-99>, "note": "<how fresh is this depiction vs other versions of ${name.split(' ')[0]}?>" },
    "collectibility":  { "score": <1-99>, "note": "<will collectors seek THIS art specifically in 5 years?>" }
  },
  "communityReception": "<one of: Highly Acclaimed / Well Received / Neutral / Polarizing>",
  "standoutFeature": "<the single best thing about this artwork in 12 words or fewer>",
  "weakness": "<biggest artistic weakness in 12 words or fewer, or empty string if none>",
  "reasoning": "<2-3 sentences. Name specific visual elements you saw${hasImage ? ' in the image' : ' or know about this card'}. Explain why it scores where it does relative to comparable SIR/IR cards.>"
}`;

  const messageContent = hasImage
    ? [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text',  text: prompt },
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
        max_tokens: 1000,
        messages:   [{ role: 'user', content: messageContent }],
      }),
    }, 28000);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = await response.json();
    const raw  = (data.content?.[0]?.text || '').trim();
    if (!raw) throw new Error('Empty response from Claude');

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) throw new Error('No JSON object in response');

    const jsonStr = cleaned.slice(s, e + 1);
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      result = JSON.parse(jsonStr.replace(/[\n\r]/g, ' '));
    }

    // Compute weighted composite if Claude left score as 0
    if (!result.score) {
      const d = result.dimensions || {};
      result.score = Math.round(
        (d.composition?.score     || 0) * 0.20 +
        (d.colorPalette?.score    || 0) * 0.15 +
        (d.emotionalImpact?.score || 0) * 0.20 +
        (d.uniqueness?.score      || 0) * 0.25 +
        (d.collectibility?.score  || 0) * 0.20
      );
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    res.status(200).json({
      success:       true,
      isFallback:    false,
      imageAnalyzed: hasImage,
      artScore:      { ...result, artistInfo },
      generatedAt:   new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/ai-art] Error:', err.message);
    res.setHeader('Cache-Control', 's-maxage=60');
    res.status(200).json({
      success:    true,
      isFallback: true,
      artScore:   buildFallbackArt(artist, rarity, name),
      error:      err.message,
    });
  }
};
