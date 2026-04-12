// api/psa-pop.js
// GET /api/psa-pop?q=Umbreon+ex+169/142+Stellar+Crown
// Scrapes PSA's public population report for a card.
// Returns: total graded, PSA 10 count, PSA 9 count, PSA 10 ratio
// Cached 12 hours — pop reports update slowly.

const fetch = require('node-fetch');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = (req.query.q || '').trim();
  if (!q) { res.status(400).json({ success: false, error: 'Missing ?q=' }); return; }

  try {
    // PSA public cert lookup / pop report search
    const searchUrl = `https://www.psacard.com/pop/tmpl/pop.aspx?s=${encodeURIComponent(q)}&h=0&y=0`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.psacard.com/',
      },
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`PSA returned ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Parse population table
    let total = 0, psa10 = 0, psa9 = 0, psa8 = 0;
    let found = false;

    // PSA pop table rows — grade in first col, count in second
    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;
      const gradeText = $(cells[0]).text().trim();
      const countText = $(cells[1]).text().trim().replace(/,/g, '');
      const count = parseInt(countText) || 0;

      if (gradeText === 'PSA 10' || gradeText === '10' || gradeText === 'GEM-MT 10') {
        psa10 = count; found = true;
      } else if (gradeText === 'PSA 9' || gradeText === '9' || gradeText === 'MINT 9') {
        psa9 = count; found = true;
      } else if (gradeText === 'PSA 8' || gradeText === '8') {
        psa8 = count; found = true;
      }
      if (gradeText === 'Total' || gradeText === 'TOTAL') {
        total = count;
      }
    });

    if (!found) {
      // Try alternative: CGC or BGS data isn't available, return not found
      res.status(200).json({ success: true, found: false, message: 'No PSA population data found for this search.' });
      return;
    }

    if (!total) total = psa10 + psa9 + psa8;
    const psa10Rate = total > 0 ? Math.round((psa10 / total) * 100) : null;

    // Scarcity signal: very few PSA 10s = higher ceiling
    const scarcitySignal = psa10 < 50 ? 'Very Scarce' : psa10 < 200 ? 'Scarce' : psa10 < 500 ? 'Moderate' : 'Common';
    const gradingAdvice = psa10Rate !== null
      ? psa10Rate >= 60 ? 'High PSA 10 rate — good candidate for grading'
      : psa10Rate >= 40 ? 'Moderate PSA 10 rate — inspect centering carefully before submitting'
      : 'Low PSA 10 rate — difficult to grade. Only submit pristine copies.'
      : null;

    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400');
    res.status(200).json({
      success: true,
      found: true,
      query: q,
      psa10,
      psa9,
      psa8,
      total,
      psa10Rate,
      scarcitySignal,
      gradingAdvice,
      scrapedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/psa-pop]', err.message);
    // Don't fail hard — PSA scraping is best-effort
    res.status(200).json({ success: false, found: false, error: err.message });
  }
};
