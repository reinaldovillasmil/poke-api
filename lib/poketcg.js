// lib/poketcg.js
// Wrapper around PokéTCG.io API.
// No API key needed — works on the free public tier.
// Vercel edge cache means we only hit this ~48x/day max.

const fetch = require('node-fetch');

const BASE = 'https://api.pokemontcg.io/v2';

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function apiFetch(path, retries = 2) {
  // Key is optional — works without it, just 1k req/day limit
  // With Vercel 30min cache that's ~48 real calls/day — well under limit
  const headers = {};
  if (process.env.POKETCG_API_KEY) headers['X-Api-Key'] = process.env.POKETCG_API_KEY;

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(`${BASE}${path}`, { headers }, 8000);
      if (res.status === 429) { await sleep(1000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`PokéTCG ${res.status}`);
      return res.json();
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('PokéTCG API timed out after 8s');
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
    id:          card.id,
    name:        card.name,
    number:      card.number,
    rarity:      card.rarity || 'Unknown',
    supertype:   card.supertype || 'Pokémon',
    subtypes:    card.subtypes || [],
    set: {
      id:           card.set?.id,
      name:         card.set?.name,
      series:       card.set?.series,
      releaseDate:  card.set?.releaseDate,
      printedTotal: card.set?.printedTotal,
      total:        card.set?.total,
      ptcgoCode:    card.set?.ptcgoCode,
    },
    tcgplayerUrl: card.tcgplayer?.url || null,
    marketPrice:  extractPrice(card),
    allPrices:    card.tcgplayer?.prices || null,
    image:        card.images?.small || null,
    imageLarge:   card.images?.large || null,
    artist:       card.artist || null,
  };
}

// Fetch secret rares — single page of 250, fast and well within rate limits
async function fetchSecretRares(rarities) {
  const q = rarities.map(r => `rarity:"${r}"`).join(' OR ');
  const fields = 'id,name,number,rarity,supertype,subtypes,set,tcgplayer,images,artist';
  const data = await apiFetch(
    `/cards?q=(${encodeURIComponent(q)})&orderBy=-set.releaseDate&pageSize=250&page=1&select=${fields}`
  );
  const seen = new Set();
  return (data?.data || [])
    .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
    .map(normalizeCard);
}

// Search cards by name
async function searchCards(query, pageSize = 60) {
  const fields = 'id,name,number,rarity,supertype,subtypes,set,tcgplayer,images,artist';
  const data = await apiFetch(
    `/cards?q=name:"${encodeURIComponent(query)}"&orderBy=-set.releaseDate&pageSize=${pageSize}&select=${fields}`
  );
  return (data?.data || []).map(normalizeCard);
}

module.exports = { fetchSecretRares, searchCards, extractPrice, normalizeCard };