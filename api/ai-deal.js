// api/ai-deal.js
// GET /api/ai-deal?name=...&rarity=...&price=...&score=...&floor=...&fair=...
//                 &collectorTier=...&characterNotes=...&lifecycleLabel=...
//                 &reprintRisk=...&playabilityContext=...
//
// Two AI analyses in one call:
//
// 1. PRICE SANITY CHECK
//    Validates whether the benchmark floor/fair/ceiling makes sense for
//    THIS specific character. Catches the Lt. Surge problem — where a
//    secondary trainer gets Cynthia-level benchmarks from tier buckets.
//    Returns a sanity verdict and adjusted confidence level.
//
// 2. DEAL SCORER
//    When a card is below floor, determines if this is:
//    A) Genuine opportunity — market hasn't priced it correctly
//    B) Market correctly ignoring it — there's a reason for the low price
//    C) Transitional — needs more time, not yet at true trough
//
// Cached 12 hours — sanity checks don't need to refresh daily.

const fetch = require('node-fetch');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function fetchWithTimeout(url, options, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// Rule-based sanity check when API unavailable
function buildFallbackSanity(name, rarity, price, floor, fair, collectorTier, characterNotes, lifecycleLabel) {
  const mkt   = parseFloat(price)  || 0;
  const flr   = parseFloat(floor)  || 0;
  const fv    = parseFloat(fair)   || 0;
  const ratio = mkt > 0 && flr > 0 ? mkt / flr : null;

  // Tiers that suggest the benchmark might be too generous
  const conservativeTiers = ['speculative', 'solid'];
  const benchmarkWarning  = conservativeTiers.includes(collectorTier);

  let sanityVerdict = 'reasonable';
  let sanityNote = '';
  let adjustedConfidence = 'medium';

  if (collectorTier === 'grail') {
    sanityVerdict = 'confirmed';
    sanityNote = `${name.split(' ')[0]} is a grail-tier character with well-documented collector demand. The benchmark is reliable.`;
    adjustedConfidence = 'high';
  } else if (collectorTier === 'blue-chip') {
    sanityVerdict = 'reasonable';
    sanityNote = `Blue-chip character. Benchmark is based on comparable SIRs of similar collector tier. Apply moderate confidence.`;
    adjustedConfidence = 'medium-high';
  } else if (collectorTier === 'solid') {
    sanityVerdict = 'conservative-advised';
    sanityNote = `Solid-tier character. Benchmark may overestimate ceiling — discount fair value by 15-25% for more conservative estimate.`;
    adjustedConfidence = 'medium';
  } else if (collectorTier === 'speculative') {
    sanityVerdict = 'use-with-caution';
    sanityNote = `Speculative character. Insufficient sales history to validate benchmark. Treat fair value as aspirational, not probable.`;
    adjustedConfidence = 'low';
  }

  // Deal score
  let dealVerdict = 'neutral';
  let dealReasoning = '';
  let dealScore = 50;

  if (ratio === null) {
    dealVerdict = 'no-price-data';
    dealReasoning = 'No market price available — cannot assess deal quality.';
    dealScore = 0;
  } else if (ratio < 0.5) {
    if (collectorTier === 'grail' || collectorTier === 'blue-chip') {
      dealVerdict = 'strong-opportunity';
      dealScore = 88;
      dealReasoning = `Trading at ${Math.round(ratio * 100)}% of floor for a ${collectorTier} character. This level of dislocation for high-demand characters is rare and typically corrects within 6-12 months as collectors notice the gap.`;
    } else {
      dealVerdict = 'investigate-further';
      dealScore = 48;
      dealReasoning = `Trading well below floor but this is a ${collectorTier} character. The market may be correctly pricing limited collector appeal. Verify eBay sold data before committing.`;
    }
  } else if (ratio < 0.85) {
    dealVerdict = 'opportunity';
    dealScore = 72;
    dealReasoning = `Below floor with room to recover. ${lifecycleLabel?.includes('BUY') ? 'Lifecycle timing supports entry.' : 'Watch lifecycle timing before committing.'}`;
  } else if (ratio <= 1.0) {
    dealVerdict = 'fair-entry';
    dealScore = 60;
    dealReasoning = 'Near floor — reasonable entry but not deeply discounted.';
  } else {
    dealVerdict = 'wait';
    dealScore = 30;
    dealReasoning = 'Above floor. Wait for a pullback closer to the floor before entering.';
  }

  return { sanityVerdict, sanityNote, adjustedConfidence, dealVerdict, dealReasoning, dealScore, isFallback: true };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const {
    name, rarity, price, score, floor, fair, ceil, peak,
    collectorTier, characterNotes, lifecycleLabel,
    reprintRisk, playabilityContext, upside,
  } = req.query;

  if (!name) { res.status(400).json({ success: false, error: 'Missing ?name=' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    const fb = buildFallbackSanity(name, rarity, price, floor, fair, collectorTier, characterNotes, lifecycleLabel);
    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json({ success: true, ...fb });
  }

  const mkt   = parseFloat(price) || 0;
  const flr   = parseFloat(floor) || 0;
  const fv    = parseFloat(fair)  || 0;
  const pct   = mkt > 0 && flr > 0 ? Math.round(((mkt - flr) / flr) * 100) : null;
  const below = pct !== null && pct < 0;

  const prompt = `You are a Pokémon TCG investment analyst specializing in collector market valuation. You will perform two analyses and return ONLY a valid JSON object — no markdown, no preamble.

STRICT RULES:
1. Base ALL reasoning on the provided data. Do not invent prices, card names, or sales history.
2. If uncertain about a comparison, say so clearly rather than inventing specifics.
3. Be calibrated and honest — conservative estimates are more useful than optimistic ones.

CARD DATA:
- Name: ${name}
- Rarity: ${rarity || 'Unknown'}
- Market Price: ${mkt > 0 ? '$' + mkt.toFixed(2) : 'Unknown'}
- Investment Score: ${score || '?'}/100
- Lifecycle Stage: ${lifecycleLabel || 'Unknown'}
- Benchmarks: Floor $${floor||'?'} / Fair $${fair||'?'} / Ceiling $${ceil||'?'} / Peak $${peak||'?'}
- Collector Tier: ${collectorTier || 'Unknown'}
- Character Notes: ${characterNotes || 'Not in character database'}
- Playability: ${playabilityContext || 'Unknown'}
- Reprint Risk Score: ${reprintRisk || 'Unknown'}/100
- Price vs Floor: ${pct !== null ? (pct > 0 ? '+' + pct + '% above floor' : Math.abs(pct) + '% below floor') : 'Unknown'}

TASK 1 — PRICE SANITY CHECK:
Assess whether the Floor ($${floor||'?'}) and Fair Value ($${fair||'?'}) benchmarks are realistic for ${name} specifically.
Consider: Is this character's collector appeal accurately reflected? Are these benchmarks too generous or too conservative for this specific character vs comparable characters you know exist?
Be direct if the benchmark seems inflated for a secondary character.

TASK 2 — DEAL SCORER:
${below ? `This card is trading ${Math.abs(pct)}% below its floor. Determine whether this is:
A) GENUINE OPPORTUNITY — market hasn't priced it correctly, upside is real
B) MARKET CORRECTLY IGNORING IT — there is a legitimate reason for the discount
C) TRANSITIONAL — needs more time before it's a clear buy` : `This card is trading ${pct !== null ? (pct > 0 ? pct + '% above floor' : 'at floor') : 'at unknown price relative to floor'}. Assess whether this is a good entry point or whether to wait.`}

Return this exact JSON:
{
  "sanityCheck": {
    "verdict": "confirmed|reasonable|conservative-advised|use-with-caution",
    "benchmarkQuality": "accurate|slightly-generous|significantly-overestimated|significantly-underestimated",
    "adjustedConfidence": "high|medium-high|medium|low",
    "reasoning": "2-3 sentences. Is this benchmark realistic for this specific character? Name the key factor driving your assessment. If the benchmark seems off, say by roughly how much and why.",
    "suggestedAdjustment": "none|discount-10-20%|discount-20-35%|premium-warranted"
  },
  "dealScore": {
    "score": 72,
    "verdict": "strong-opportunity|opportunity|fair-entry|wait|avoid|market-correctly-ignoring",
    "confidence": "high|medium|low",
    "reasoning": "3-4 sentences. What is the most likely explanation for the current price? What needs to be true for this to be a good investment? What is the key risk that could make this wrong?",
    "keyRisk": "1 sentence on the single biggest risk to this investment thesis.",
    "actionVerdict": "Buy now|Accumulate on dips|Set alert at $X|Wait for trough|Avoid"
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
        model:      'claude-haiku-4-5-20251001',
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
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const s       = cleaned.indexOf('{');
    const e       = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) throw new Error('No JSON in response');

    const result = JSON.parse(cleaned.slice(s, e + 1));
    if (!result.sanityCheck || !result.dealScore) throw new Error('Missing required fields');

    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400');
    res.status(200).json({
      success: true,
      cardName: name,
      isFallback: false,
      sanityVerdict:       result.sanityCheck.verdict,
      benchmarkQuality:    result.sanityCheck.benchmarkQuality,
      adjustedConfidence:  result.sanityCheck.adjustedConfidence,
      sanityReasoning:     result.sanityCheck.reasoning,
      suggestedAdjustment: result.sanityCheck.suggestedAdjustment,
      dealScore:           result.dealScore.score,
      dealVerdict:         result.dealScore.verdict,
      dealConfidence:      result.dealScore.confidence,
      dealReasoning:       result.dealScore.reasoning,
      keyRisk:             result.dealScore.keyRisk,
      actionVerdict:       result.dealScore.actionVerdict,
    });

  } catch (err) {
    console.error('[/api/ai-deal]', err.message);
    const fb = buildFallbackSanity(name, rarity, price, floor, fair, collectorTier, characterNotes, lifecycleLabel);
    res.setHeader('Cache-Control', 's-maxage=300');
    res.status(200).json({ success: true, isFallback: true, error: err.message, ...fb });
  }
};
