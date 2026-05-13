// api/set-cards.js
// GET /api/set-cards?setId=base2&minPrice=7
//
// Returns all cards from a specific set priced above the minimum,
// fully scored. Handles vintage sets via cardmarket fallback pricing.

const fetch = require('node-fetch');
const { normalizeCard } = require('../lib/poketcg');
const { scoreCard, getBenchmarks, getDemandScore, isSetOOP } = require('../lib/scoring');

const BASE = 'https://api.pokemontcg.io/v2';
const KEY  = process.env.POKETCG_API_KEY || '';
const FIELDS = 'id,name,number,rarity,supertype,subtypes,set,tcgplayer,cardmarket,images,artist';

function buildCard(card) {
  const s = scoreCard({
    name: card.name, rarity: card.rarity, setId: card.set.id,
    releaseDate: card.set.releaseDate, printedTotal: card.set.printedTotal,
    price: card.marketPrice, supertype: card.supertype,
  });
  const demandScore = getDemandScore(card.name);
  const isTrainer   = card.supertype === 'Trainer';
  const bench       = getBenchmarks(card.rarity, demandScore, isTrainer, card.name);
  const cardNo      = card.number ? `${card.number}/${card.set.printedTotal || '?'}` : null;
  const ebayQuery   = [card.name, cardNo, card.set.name, card.rarity].filter(Boolean).join(' ');
  return {
    ...card, cardNo,
    score:              s.total,
    hasPrice:           s.hasPrice,
    isHiddenGem:        s.isHiddenGem,
    playabilityContext: s.playabilityContext,
    playabilityLabel:   s.playabilityLabel,
    recommendation:     s.recommendation,
    lifecycleLabel:     s.lifecycleLabel,
    breakdown:          s.breakdown,
    benchmarks:         bench,
    upside:             s.upside,
    collectorTier:      s.collectorTier,
    characterNotes:     s.characterNotes,
    reprintRiskScore:   s.reprintRiskScore,
    isOOP:              isSetOOP(card.set.id),
    ebayQuery,
  };
}

async function fetchPage(setId, page) {
  const headers = KEY ? { 'X-Api-Key': KEY } : {};
  const url = `${BASE}/cards?q=set.id:"${setId}"&pageSize=250&page=${page}&orderBy=-number&select=${FIELDS}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`PokéTCG ${r.status}`);
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { setId } = req.query;
  if (!setId) return res.status(400).json({ success: false, error: 'Missing ?setId=' });

  const minPrice = Math.max(0, parseFloat(req.query.minPrice) || 7);

  try {
    const first = await fetchPage(setId, 1);
    let raw = first.data || [];

    // Fetch extra pages if the set has more than 250 cards
    if (first.totalCount > 250) {
      const pageCount = Math.ceil(first.totalCount / 250);
      const extras = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, i) => fetchPage(setId, i + 2))
      );
      for (const d of extras) raw = raw.concat(d.data || []);
    }

    const cards = raw
      .map(normalizeCard)
      .filter(c => c.marketPrice >= minPrice)
      .map(buildCard)
      .sort((a, b) => b.score - a.score);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(200).json({
      success:      true,
      setId,
      setName:      cards[0]?.set?.name || setId,
      totalInSet:   first.totalCount,
      cardCount:    cards.length,
      minPrice,
      cards,
    });
  } catch (err) {
    console.error('[/api/set-cards]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
