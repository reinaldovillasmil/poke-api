// lib/ebay.js
// Scrapes eBay sold listings with multiple approaches and proper headers.
// eBay blocks some Vercel IPs — uses aggressive header spoofing and
// falls back gracefully when blocked.

const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Rotate user agents to avoid pattern detection
const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

function getHeaders() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  };
}

const EXCLUDE = [
  'psa','cgc','bgs','graded','lot of','bundle','sealed','booster',
  'box','sleeve','binder','case','display','etb','elite trainer',
  'proxy','fake','reprint','custom','collection','x2','x3','x4',
  '2x','3x','4x','mixed lot',
];

function isValid(title, price) {
  const lower = title.toLowerCase();
  if (EXCLUDE.some(kw => lower.includes(kw))) return false;
  if (price <= 0.99 || price > 8000) return false;
  return true;
}

function parseDaysAgo(dateStr) {
  if (!dateStr) return 30;
  const lower = dateStr.toLowerCase();
  if (lower.includes('just') || lower.includes('today')) return 0;
  const m = lower.match(/(\d+)\s*(day|week|month)/);
  if (!m) return 15;
  const n = parseInt(m[1]);
  if (m[2].startsWith('day'))   return n;
  if (m[2].startsWith('week'))  return n * 7;
  if (m[2].startsWith('month')) return n * 30;
  return 15;
}

async function scrapeSoldListings(query, maxPages = 1) {
  const sales = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    // Try eBay sold search
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&LH_ItemCondition=3&_sop=13&_ipg=60&_pgn=1`;
    const res = await fetch(url, {
      headers: getHeaders(),
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`eBay returned ${res.status} for query: ${query}`);
      return sales;
    }

    const html = await res.text();

    // Check if we got blocked (CAPTCHA or auth page)
    if (html.includes('captcha') || html.includes('sign in to') || html.length < 5000) {
      console.warn('eBay blocked request — CAPTCHA or auth redirect');
      return sales;
    }

    const $ = cheerio.load(html);

    $('.s-item').each((i, el) => {
      if (i === 0) return; // skip template item
      const title = $(el).find('.s-item__title').text().trim();
      const priceText = $(el).find('.s-item__price').text().replace(/[^0-9.]/g,'');
      const dateText = $(el).find('.s-item__ended-date, .s-item__listingDate').text().trim();
      const price = parseFloat(priceText);
      if (!title || !price || !isValid(title, price)) return;
      sales.push({ title, price, daysAgo: parseDaysAgo(dateText) });
    });

  } catch (err) {
    clearTimeout(timeout);
    if (err.name !== 'AbortError') console.error('eBay scrape error:', err.message);
  }

  return sales;
}

function analyzePrice(sales) {
  if (!sales || sales.length < 2) return null;

  // Remove outliers (beyond 2 std deviations)
  const prices = sales.map(s => s.price).sort((a,b) => a-b);
  const mean = prices.reduce((a,b) => a+b, 0) / prices.length;
  const std  = Math.sqrt(prices.map(p => (p-mean)**2).reduce((a,b)=>a+b,0) / prices.length);
  const filtered = sales.filter(s => Math.abs(s.price - mean) <= 2 * std);
  if (filtered.length < 2) return null;

  const recent7  = filtered.filter(s => s.daysAgo <= 7);
  const recent30 = filtered.filter(s => s.daysAgo <= 30);

  const avg  = n => n.length ? Math.round(n.reduce((a,s) => a+s.price,0) / n.length * 100) / 100 : null;
  const trim = arr => {
    if (arr.length < 4) return avg(arr);
    const s = [...arr].sort((a,b)=>a.price-b.price);
    const cut = Math.floor(s.length * 0.1);
    return avg(s.slice(cut, s.length - cut));
  };

  const avg7  = avg(recent7);
  const avg30 = avg(recent30);
  const trimmedAvg = trim(filtered);
  const trendPct = avg7 && avg30 ? Math.round(((avg7 - avg30) / avg30) * 100) : 0;
  const trend = trendPct > 8 ? 'rising' : trendPct < -8 ? 'falling' : 'stable';
  const all = filtered.map(s=>s.price);

  return {
    avg:        trimmedAvg,
    trimmedAvg,
    avg7,
    avg30,
    low:        Math.round(Math.min(...all) * 100) / 100,
    high:       Math.round(Math.max(...all) * 100) / 100,
    count:      filtered.length,
    trend,
    trendPct,
    found:      true,
  };
}

module.exports = { scrapeSoldListings, analyzePrice };