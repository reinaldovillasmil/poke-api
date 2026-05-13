// api/cards.js
// GET /api/cards — secret rares, fully scored. Cached 30min.
//
// Query params:
//   ?rarity=Special Illustration Rare
//   ?minScore=70
//   ?maxPrice=100
//   ?sort=score|price|upside|new        (frontend sort)
//   ?hiddenGems=1

const { fetchSecretRares } = require('../lib/poketcg');
const { scoreCard, getBenchmarks, getDemandScore, isSetOOP } = require('../lib/scoring');
const { getCharacterProfile } = require('../lib/characters');

const SECRET_RARITIES = [
  // SV era
  'Special Illustration Rare',
  'Illustration Rare',
  'Hyper Rare',
  'Mega Hyper Rare',             // newest SV sets (2026)
  // SWSH era
  'Rainbow Rare',
  'Secret Rare',
  'Full Art',
  'Rare Holo VMAX',              // Umbreon VMAX Alt Art, Charizard VMAX etc.
  'Rare Holo VSTAR',             // Charizard VSTAR, Arceus VSTAR etc.
  'Trainer Gallery Rare Holo',   // Crown Zenith & Brilliant Stars TG cards
  // SM / BW / XY era
  'Rare Ultra',                  // N Full Art, Cynthia FA, all EX/GX/V Full Arts
  'Rare Rainbow',                // SM-era rainbow rares
  'Rare Shiny GX',               // Hidden Fates Shiny Vault
];

// Era-bucketed configs — 2 from each bucket are randomly picked every build.
// This GUARANTEES old and new cards appear together in every pool rebuild.
const MODERN_CONFIGS = [           // SV / newest sets
  { apiSort: '-set.releaseDate', apiPage: 1 },
  { apiSort: '-set.releaseDate', apiPage: 2 },
  { apiSort: '-set.releaseDate', apiPage: 3 },
  { apiSort: '-set.releaseDate', apiPage: 4 },
  { apiSort: '-set.releaseDate', apiPage: 5 },
];
const OLDER_CONFIGS = [            // BW / XY / SM era (oldest first)
  { apiSort: 'set.releaseDate',  apiPage: 1 },
  { apiSort: 'set.releaseDate',  apiPage: 2 },
  { apiSort: 'set.releaseDate',  apiPage: 3 },
  { apiSort: 'set.releaseDate',  apiPage: 4 },
];
const MIXED_CONFIGS = [            // name / set / number sorts — mixes all eras
  { apiSort: 'name',    apiPage: 1 },
  { apiSort: 'name',    apiPage: 2 },
  { apiSort: '-name',   apiPage: 1 },
  { apiSort: '-name',   apiPage: 2 },
  { apiSort: '-number', apiPage: 1 },
  { apiSort: 'set.name',  apiPage: 1 },
  { apiSort: '-set.name', apiPage: 1 },
];

// Always 2 modern + 2 older + 2 mixed = 6 fetches, ~864 req/day at 10-min TTL
function selectConfigs() {
  return [
    ...fisherYates([...MODERN_CONFIGS]).slice(0, 2),
    ...fisherYates([...OLDER_CONFIGS]).slice(0, 2),
    ...fisherYates([...MIXED_CONFIGS]).slice(0, 2),
  ];
}

const POOL_TTL   = 10 * 60 * 1000; // 10 minutes (~864 API calls/day)
const SAMPLE_SIZE = 150;            // cards returned per request

let _pool          = [];
let _poolFetchedAt = 0;
let _poolBuilding  = false;

async function buildPool() {
  if (_poolBuilding) return; // prevent concurrent refreshes
  _poolBuilding = true;
  try {
    // 2 modern + 2 older + 2 mixed — guaranteed era diversity every rebuild
    const configs = selectConfigs();
    const results = await Promise.allSettled(
      configs.map(c => fetchSecretRares(SECRET_RARITIES, c.apiPage, c.apiSort))
    );
    const seen = new Set();
    const all  = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const card of r.value) {
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        all.push(buildCard(card));
      }
    }
    // Strip cards with no price — they distort scoring and clutter the feed
    const priced = all.filter(c => c.marketPrice > 0);
    if (priced.length > 0) {
      _pool          = priced;
      _poolFetchedAt = Date.now();
    }
  } finally {
    _poolBuilding = false;
  }
}

async function getPool() {
  if (_pool.length === 0 || Date.now() - _poolFetchedAt > POOL_TTL) {
    await buildPool();
  } else if (Date.now() - _poolFetchedAt > POOL_TTL - 60000) {
    // Background refresh when within 1 min of expiry — don't block the request
    buildPool().catch(() => {});
  }
  return _pool;
}

function fisherYates(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function sanitizeNumber(val, fallback) {
  const n = parseFloat(val); return isNaN(n) ? fallback : n;
}

function buildCard(card) {
  const s = scoreCard({
    name: card.name, rarity: card.rarity, setId: card.set.id,
    releaseDate: card.set.releaseDate, printedTotal: card.set.printedTotal,
    price: card.marketPrice, supertype: card.supertype,
  });
  const demandScore = getDemandScore(card.name);
  const isTrainer = card.supertype === 'Trainer';
  const bench = getBenchmarks(card.rarity, demandScore, isTrainer, card.name);
  const cardNo = card.number ? `${card.number}/${card.set.printedTotal || '?'}` : null;
  const ebayQuery = [card.name, cardNo, card.set.name, card.rarity].filter(Boolean).join(' ');
  return {
    ...card, cardNo,
    score: s.total, hasPrice: s.hasPrice, isHiddenGem: s.isHiddenGem,
    playabilityContext: s.playabilityContext, playabilityLabel: s.playabilityLabel,
    recommendation: s.recommendation, lifecycleLabel: s.lifecycleLabel,
    breakdown: s.breakdown, benchmarks: bench, upside: s.upside,
    collectorTier: s.collectorTier, characterNotes: s.characterNotes,
    reprintRiskScore: s.reprintRiskScore,
    isOOP: isSetOOP(card.set.id), ebayQuery,
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const pool = await getPool();

    // Apply filters on the full pool
    const { rarity, sort = 'score', hiddenGems } = req.query;
    const minScore = sanitizeNumber(req.query.minScore, 0);
    const minPrice = sanitizeNumber(req.query.minPrice, 0);
    const maxPrice = sanitizeNumber(req.query.maxPrice, 99999);

    let filtered = pool;
    if (rarity)             filtered = filtered.filter(c => c.rarity === rarity);
    if (minScore)           filtered = filtered.filter(c => c.score >= minScore);
    if (minPrice > 0)       filtered = filtered.filter(c => c.marketPrice >= minPrice);
    if (maxPrice < 99999)   filtered = filtered.filter(c => !c.marketPrice || c.marketPrice <= maxPrice);
    if (hiddenGems === '1') filtered = filtered.filter(c => c.isHiddenGem);

    // Randomly sample so each request surfaces different cards
    const sample = filtered.length > SAMPLE_SIZE
      ? fisherYates(filtered).slice(0, SAMPLE_SIZE)
      : fisherYates(filtered);

    // Sort within the random sample
    const validSorts = ['score','price','upside','new'];
    const safeSort = validSorts.includes(sort) ? sort : 'score';
    sample.sort((a, b) => {
      if (safeSort === 'price')  return (a.marketPrice||999) - (b.marketPrice||999);
      if (safeSort === 'upside') return (b.upside||0) - (a.upside||0);
      if (safeSort === 'new')    return new Date(b.set.releaseDate||0) - new Date(a.set.releaseDate||0);
      if (a.isHiddenGem && !b.isHiddenGem) return -1;
      if (!a.isHiddenGem && b.isHiddenGem) return 1;
      return b.score - a.score;
    });

    // Short cache so each client gets a fresh shuffle on reload
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({
      success: true,
      count: sample.length,
      total: pool.length,
      poolSize: pool.length,
      hiddenGems: pool.filter(c => c.isHiddenGem).length,
      updatedAt: new Date(_poolFetchedAt).toISOString(),
      cards: sample,
    });
  } catch (err) {
    console.error('[/api/cards]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Named export so other endpoints can share the same cached pool
// without an extra HTTP round-trip. The default export (handler) is unchanged.
module.exports.getPool = getPool;