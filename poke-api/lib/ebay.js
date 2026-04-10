// lib/ebay.js
// Scrapes eBay sold listings and returns clean price statistics.
// Filters out graded cards, lots, accessories, and obvious outliers.
// Returns 7-day, 30-day averages and trend signal.

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

// Keywords that indicate a listing is NOT a raw NM single card
const EXCLUDE_KEYWORDS = [
  'psa', 'cgc', 'bgs', 'graded', 'lot of', 'bundle', 'sealed', 'booster',
  'box', 'sleeve', 'binder', 'case', 'display', 'etb', 'elite trainer',
  'proxy', 'fake', 'reprint', 'custom', 'collection', 'x2', 'x3', 'x4',
  '2x', '3x', '4x', 'nm/mint lot', 'mixed lot',
];

function isValidListing(title, price) {
  const lower = title.toLowerCase();
  if (EXCLUDE_KEYWORDS.some(kw => lower.includes(kw))) return false;
  if (price <= 0.99 || price > 8000) return false; // obvious garbage
  return true;
}

// Parse eBay's date strings into days ago
function parseDaysAgo(dateStr) {
  if (!dateStr) return 999;
  const lower = dateStr.toLowerCase();
  if (lower.includes('just')) return 0;
  if (lower.includes('today')) return 0;
  const match = lower.match(/(\d+)\s*(day|week|month)/);
  if (!match) return 30;
  const n = parseInt(match[1]);
  if (match[2].startsWith('day')) return n;
  if (match[2].startsWith('week')) return n * 7;
  if (match[2].startsWith('month')) return n * 30;
  return 30;
}

async function scrapeSoldListings(query, maxPages = 2) {
  const sales = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&LH_ItemCondition=3&_sop=13&_ipg=60&_pgn=${page}`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) break;
      const html = await res.text();
      const $ = cheerio.load(html);

      $('.s-item').each((i, el) => {
        const title = $(el).find('.s-item__title').text().trim();
        if (!title || title === 'Shop on eBay') return;

        const priceText = $(el).find('.s-item__price').first().text().trim();
        // Handle price ranges — take the lower
        const prices = priceText.match(/[\d,]+\.?\d*/g) || [];
        if (!prices.length) return;
        const price = parseFloat(prices[0].replace(/,/g, ''));

        if (!isValidListing(title, price)) return;

        const dateText = $(el).find('.s-item__ended-date').text().trim()
          || $(el).find('.POSITIVE').text().trim();
        const daysAgo = parseDaysAgo(dateText);

        const condition = $(el).find('.SECONDARY_INFO').text().trim();
        const link = ($(el).find('a.s-item__link').attr('href') || '').split('?')[0];

        sales.push({ title, price, daysAgo, condition, link, dateText });
      });

      // Check if there's a next page
      const hasNext = $('.pagination__next').length > 0;
      if (!hasNext) break;

    } catch (err) {
      console.error(`eBay scrape page ${page} error:`, err.message);
      break;
    }
  }

  return sales;
}

function analyzePrice(sales) {
  if (!sales.length) return null;

  const prices = sales.map(s => s.price).sort((a, b) => a - b);

  // Remove top and bottom 10% as outliers
  const trimCount = Math.max(1, Math.floor(prices.length * 0.1));
  const trimmed = prices.slice(trimCount, prices.length - trimCount);
  const avg = trimmed.length ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length : prices[prices.length >> 1];

  const recent7 = sales.filter(s => s.daysAgo <= 7).map(s => s.price);
  const recent30 = sales.filter(s => s.daysAgo <= 30).map(s => s.price);

  const avg7  = recent7.length  ? recent7.reduce((a,b)=>a+b,0)/recent7.length   : null;
  const avg30 = recent30.length ? recent30.reduce((a,b)=>a+b,0)/recent30.length : null;

  // Trend: compare 7-day avg to 30-day avg
  let trend = 'stable';
  let trendPct = 0;
  if (avg7 && avg30) {
    trendPct = Math.round(((avg7 - avg30) / avg30) * 100);
    if (trendPct >= 10)  trend = 'rising';
    else if (trendPct <= -10) trend = 'falling';
  }

  return {
    count: sales.length,
    avg: +avg.toFixed(2),
    avg7:  avg7  ? +avg7.toFixed(2)  : null,
    avg30: avg30 ? +avg30.toFixed(2) : null,
    low:  +prices[0].toFixed(2),
    high: +prices[prices.length - 1].toFixed(2),
    median: +prices[prices.length >> 1].toFixed(2),
    trend,
    trendPct,
    recentSales: sales.slice(0, 8).map(s => ({ price: s.price, daysAgo: s.daysAgo, condition: s.condition, link: s.link })),
  };
}

module.exports = { scrapeSoldListings, analyzePrice };
