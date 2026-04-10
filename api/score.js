// api/score.js
// GET /api/score?id=sv7-169   (PokéTCG card ID)
// GET /api/score?name=Umbreon+ex&set=scr&number=169
//
// Returns a full investment score breakdown for a specific card,
// plus real eBay sold prices scraped live.
// This is what powers the card detail expanded view.

const fetch = require('node-fetch');
const { normalizeCard, extractPrice } = require('../lib/poketcg');
const { scoreCard, getBenchmark, getPokemonScore } = require('../lib/scoring');
const { scrapeSoldListings, analyzePrice } = require('../lib/ebay');

const BASE = 'https://api.pokemontcg.io/v2';
const KEY  = process.env.POKETCG_API_KEY || '';

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { id, name, set, number } = req.query;
  if (!id && !name) { res.status(400).json({ success: false, error: 'Provide ?id= or ?name=' }); return; }

  try {
    // Fetch the card from PokéTCG
    const headers = KEY ? { 'X-Api-Key': KEY } : {};
    let cardData;

    if (id) {
      const r = await fetch(`${BASE}/cards/${encodeURIComponent(id)}`, { headers });
      if (!r.ok) throw new Error(`Card not found: ${id}`);
      const d = await r.json();
      cardData = normalizeCard(d.data);
    } else {
      let q = `name:"${name}"`;
      if (set)    q += ` set.id:"${set}"`;
      if (number) q += ` number:"${number}"`;
      const r = await fetch(`${BASE}/cards?q=${encodeURIComponent(q)}&pageSize=1`, { headers });
      const d = await r.json();
      if (!d.data?.length) throw new Error(`No card found for: ${q}`);
      cardData = normalizeCard(d.data[0]);
    }

    // Score the card
    const scoreResult = scoreCard({
      name:         cardData.name,
      rarity:       cardData.rarity,
      setId:        cardData.set.id,
      releaseDate:  cardData.set.releaseDate,
      printedTotal: cardData.set.printedTotal,
      price:        cardData.marketPrice,
      supertype:    cardData.supertype,
    });

    const pokemonScore = getPokemonScore(cardData.name);
    const bench = getBenchmark(cardData.rarity, pokemonScore, cardData.supertype === 'Trainer');
    const cardNo = cardData.number ? `${cardData.number}/${cardData.set.printedTotal || '?'}` : null;

    // Scrape real eBay sold data
    const ebayQ = [cardData.name, cardNo, cardData.set.name, cardData.rarity].filter(Boolean).join(' ');
    const sales = await scrapeSoldListings(ebayQ, 2);
    const ebayData = analyzePrice(sales);

    // Build comprehensive response
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(200).json({
      success: true,
      card: {
        ...cardData,
        cardNo,
      },
      score: {
        total:          scoreResult.total,
        recommendation: scoreResult.recommendation,
        lifecycleLabel: scoreResult.lifecycleLabel,
        breakdown: {
          pull:      { score: scoreResult.breakdown.pullScore,      weight: '20%', label: 'Pull Rate Rarity' },
          pokemon:   { score: scoreResult.breakdown.pokemonScore,   weight: '20%', label: 'Pokémon Demand' },
          lifecycle: { score: scoreResult.breakdown.lifecycleScore, weight: '25%', label: 'Set Lifecycle' },
          price:     { score: scoreResult.breakdown.priceScore,     weight: '20%', label: 'Price vs Floor' },
          printRun:  { score: scoreResult.breakdown.printRunScore,  weight: '10%', label: 'Print Run Size' },
          upside:    { score: scoreResult.breakdown.upsideScore,    weight: '5%',  label: 'Upside Potential' },
        },
      },
      benchmarks: {
        floor:     bench.floor,
        fair:      bench.fair,
        ceiling:   bench.ceil,
        current:   cardData.marketPrice,
        upside:    cardData.marketPrice > 0 ? Math.round(((bench.fair - cardData.marketPrice) / cardData.marketPrice) * 100) : null,
      },
      ebay: ebayData || { found: false },
      ebayQuery: ebayQ,
      analyzedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/score]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
