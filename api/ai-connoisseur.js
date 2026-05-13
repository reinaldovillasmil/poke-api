// api/ai-connoisseur.js
// GET /api/ai-connoisseur?budget=80&count=3
//
// Acts as an AI "connoisseur" — pulls the live scored pool, finds candidates
// within the budget, and asks Claude to pick the best investments with
// specific, opinionated reasoning for each pick.

const fetch = require('node-fetch');
const { getPool } = require('./cards');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const ARTIST_TIERS = {
  'Mitsuhiro Arita':'S','Atsushi Furusawa':'S','Naoki Saito':'S',
  'Akira Komayama':'S','Narumi Sato':'S','Yuka Morii':'S',
  'HYOGONOSUKE':'A','Shibuzoh.':'A','Tomokazu Komiya':'A','Ryuta Fuse':'A',
  'Yusuke Ohmura':'A','Kouki Saitou':'A','danciao':'A','Taiga Kasai':'A',
  'Sanosuke Sakuma':'A','Eske Yoshinob':'A','Hasuno':'A','Aoji':'A',
  'kirisAki':'A','Yuu Nishida':'A','Nagimiso':'A','sui':'A','Jerky':'A',
  'Kyuugou':'A','Mizue':'A','Wataru Kanda':'A','Naoyo Kimura':'A',
  'Teeziro':'A','Uninori':'A','Saya Tsuruta':'A',
  '5ban Graphics':'B','Planeta CG Works':'B','Ryo Ueda':'B',
  'Kagemaru Himeno':'B','Yoshinobu Saito':'B','Souichirou Gunjima':'B',
  'Emre Unayli':'B','Toshinao Aoki':'B','2by2':'B',
};

function artistTier(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const [k, t] of Object.entries(ARTIST_TIERS)) {
    if (lower.includes(k.toLowerCase())) return t;
  }
  return null;
}

function sanitizeNumber(v, fallback) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function fetchWithTimeout(url, opts, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function formatCandidate(c, rank) {
  const price  = c.marketPrice > 0 ? `$${c.marketPrice.toFixed(2)}` : 'No price';
  const b      = c.benchmarks || {};
  const fair   = b.fair   ? `$${b.fair}`   : '?';
  const floor  = b.floor  ? `$${b.floor}`  : '?';
  const upside = c.upside != null ? `${c.upside > 0 ? '+' : ''}${c.upside}%` : '?';
  const tier   = artistTier(c.artist);
  const artistStr = c.artist ? `${c.artist}${tier ? ` (${tier}-tier)` : ''}` : 'Unknown';
  const gem    = c.isHiddenGem ? ' 💎GEM' : '';
  const notes  = c.characterNotes ? ` | ${c.characterNotes.slice(0, 80)}` : '';
  return `#${rank} [${c.id}] ${c.name} | ${c.rarity} | ${c.set?.name || '?'} | ${price} | Score:${c.score} | ${c.lifecycleLabel || '?'} | Artist:${artistStr} | Floor:${floor} Fair:${fair} Upside:${upside}${gem}${notes}`;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const budget = sanitizeNumber(req.query.budget, 80);
  const count  = Math.min(5, Math.max(1, parseInt(req.query.count) || 3));
  const apiKey = process.env.ANTHROPIC_API_KEY;

  try {
    const pool = await getPool();

    // Take top 60 by score, then shuffle so each call gives Claude a different
    // high-quality subset — prevents the same 3 picks every time.
    const top60 = pool
      .filter(c => c.marketPrice > 0 && c.marketPrice <= budget && c.score >= 55)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);

    function fisherYates(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    const candidates = fisherYates(top60).slice(0, 30);

    if (candidates.length < count) {
      return res.status(200).json({
        success: false,
        error: `Only ${candidates.length} cards found under $${budget} with a score ≥ 55. Try a higher budget.`,
      });
    }

    if (!apiKey) {
      // Fallback: just return the top N by score with a note
      const picks = candidates.slice(0, count).map(c => ({
        id: c.id, name: c.name, price: c.marketPrice, set: c.set?.name,
        rarity: c.rarity, image: c.image,
        why: `Score ${c.score}/100 — ${c.lifecycleLabel || 'Unknown lifecycle'}. ${c.characterNotes || ''} No AI key set for deeper analysis.`,
      }));
      return res.status(200).json({ success: true, isFallback: true, budget, picks, summary: 'Ranked by investment score. Add ANTHROPIC_API_KEY for AI reasoning.' });
    }

    const candidateList = candidates.map((c, i) => formatCandidate(c, i + 1)).join('\n');

    const prompt = `You are a seasoned Pokémon TCG connoisseur and investment analyst — you've followed the secondary market for a decade, attended major auctions, and have a nose for undervalued cards. You are direct, opinionated, and you back your picks with specific reasoning.

From today's market screener, pick exactly ${count} cards to buy RIGHT NOW, all under $${budget}. These should be your strongest conviction picks — not just the highest scores, but the cards with the best story, the most asymmetric upside, and the clearest collector thesis.

CANDIDATES (top 30 by investment score, all under $${budget}):
${candidateList}

WHAT TO WEIGH:
- Cards in BUY ZONE or Recovery Underway lifecycle are in the sweet spot
- S/A-tier artists are a major premium driver — same character, better artist = better long-term hold
- Hidden Gems (💎) are underappreciated by the market right now — extra points
- Price well below Fair value = asymmetric upside
- Avoid 5ban/CGI (B-tier) unless the price dislocation is genuinely extreme
- Characters with low reprint risk appreciate more independently

Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "picks": [
    {
      "id": "<exact card id from the candidate list>",
      "name": "<card name>",
      "price": <current price as a number>,
      "rarity": "<rarity>",
      "why": "<2-3 sentences. Name what specifically makes THIS card a buy right now — the artist, the character's trajectory, the lifecycle position, what the market is missing. Be direct and concrete, not generic.>"
    }
  ],
  "summary": "<1-2 sentences on the overarching theme of your picks — what market inefficiency or trend are you exploiting?>"
}`;

    const response = await fetchWithTimeout(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  1200,
        temperature: 0.9,
        messages:    [{ role: 'user', content: prompt }],
      }),
    }, 30000);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data    = await response.json();
    const raw     = (data.content?.[0]?.text || '').trim();
    if (!raw) throw new Error('Empty response from Claude');

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) throw new Error('No JSON in response');

    const jsonStr = cleaned.slice(s, e + 1);
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      result = JSON.parse(jsonStr.replace(/[\n\r]/g, ' '));
    }

    if (!result.picks?.length) throw new Error('No picks in response');

    // Enrich picks with full card data from the pool (image, set info, etc.)
    const poolMap = Object.fromEntries(pool.map(c => [c.id, c]));
    const enriched = result.picks.map(pick => {
      const card = poolMap[pick.id] || {};
      return {
        id:       pick.id,
        name:     pick.name     || card.name,
        price:    pick.price    ?? card.marketPrice,
        rarity:   pick.rarity   || card.rarity,
        why:      pick.why,
        image:    card.image    || null,
        set:      card.set?.name || null,
        score:    card.score    || null,
        artist:   card.artist   || null,
        benchmarks: card.benchmarks || null,
        lifecycleLabel: card.lifecycleLabel || null,
        isHiddenGem:    card.isHiddenGem || false,
      };
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      success:     true,
      isFallback:  false,
      budget,
      count,
      candidatesEvaluated: candidates.length,
      picks:       enriched,
      summary:     result.summary || '',
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/ai-connoisseur]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
