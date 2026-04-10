// lib/poketcg.js
// Wrapper around PokéTCG.io API with retry logic and price extraction.

const fetch = require('node-fetch');

const BASE = 'https://api.pokemontcg.io/v2';
const KEY  = process.env.POKETCG_API_KEY || '';

async function apiFetch(path, retries = 2) {
  const headers = KEY ? { 'X-Api-Key': KEY } : {};
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers });
      if (res.status === 429) { await sleep(1000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`PokéTCG ${res.status}: ${path}`);
      return res.json();
    } catch (err) {
      if (i === retries) throw err;
      await sleep(500);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractPrice(card) {
  const p = card.tcgplayer?.prices;
  if (!p) return 0;
  return +(
    p?.holofoil?.market ||
    p?.normal?.market ||
    p?.['1stEditionHolofoil']?.market ||
    p?.reverseHolofoil?.market ||
    p?.holofoil?.mid ||
    p?.normal?.mid ||
    0
  ).toFixed(2);
}

function normalizeCard(card) {
  return {
    id:           card.id,
    name:         card.name,
    number:       card.number,
    rarity:       card.rarity || 'Unknown',
    supertype:    card.supertype || 'Pokémon',
    subtypes:     card.subtypes || [],
    set: {
      id:           card.set?.id,
      name:         card.set?.name,
      series:       card.set?.series,
      releaseDate:  card.set?.releaseDate,
      printedTotal: card.set?.printedTotal,
      total:        card.set?.total,
      ptcgoCode:    card.set?.ptcgoCode,
    },
    tcgplayerUrl:  card.tcgplayer?.url || null,
    marketPrice:   extractPrice(card),
    allPrices:     card.tcgplayer?.prices || null,
    image:         card.images?.small || null,
    imageLarge:    card.images?.large || null,
    artist:        card.artist || null,
  };
}

// Fetch pages of secret rares in parallel
async function fetchSecretRares(rarities, pages = 3) {
  const q = rarities.map(r => `rarity:"${r}"`).join(' OR ');
  const fields = 'id,name,number,rarity,supertype,subtypes,set,tcgplayer,images,artist';

  const requests = Array.from({ length: pages }, (_, i) =>
    apiFetch(`/cards?q=(${encodeURIComponent(q)})&orderBy=-set.releaseDate&pageSize=250&page=${i+1}&select=${fields}`)
  );

  const results = await Promise.allSettled(requests);
  const cards = [];
  const seen = new Set();

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const card of (r.value?.data || [])) {
      if (!seen.has(card.id)) { seen.add(card.id); cards.push(normalizeCard(card)); }
    }
  }

  return cards;
}

// Search cards by name
async function searchCards(query, pageSize = 60) {
  const fields = 'id,name,number,rarity,supertype,subtypes,set,tcgplayer,images,artist';
  const data = await apiFetch(`/cards?q=name:"${encodeURIComponent(query)}"&orderBy=-set.releaseDate&pageSize=${pageSize}&select=${fields}`);
  return (data?.data || []).map(normalizeCard);
}

module.exports = { fetchSecretRares, searchCards, extractPrice, normalizeCard };
