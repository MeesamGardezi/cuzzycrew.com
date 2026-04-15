'use strict';

const express  = require('express');
const helmet   = require('helmet');
const morgan   = require('morgan');
const fetch    = require('node-fetch');
const path     = require('path');
const fs       = require('fs');

/* ================================================================
   DATA LAYER — file-based persistence (no DB dependency)
================================================================ */
const DATA_DIR   = path.join(__dirname, 'data');
const VIEWS_FILE = path.join(DATA_DIR, 'views.json');
const SUBS_FILE  = path.join(DATA_DIR, 'subscribers.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(VIEWS_FILE)) writeJSON(VIEWS_FILE, {});
if (!fs.existsSync(SUBS_FILE))  writeJSON(SUBS_FILE, []);

const app  = express();
const PORT = process.env.PORT || 3000;

/* ================================================================
   SECURITY HEADERS
================================================================ */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", "'unsafe-inline'"],           // inline scripts in EJS views
        styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
        imgSrc:      ["'self'", 'data:'],
        connectSrc:  ["'self'"],
        frameSrc:    ["'none'"],
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,  // needed for Google Fonts
  })
);

/* ================================================================
   LOGGING
================================================================ */
app.use(morgan('dev'));

/* ================================================================
   BODY PARSING
================================================================ */
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/* ================================================================
   STATIC FILES
================================================================ */
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag:   true,
}));

/* ================================================================
   VIEW ENGINE — EJS
================================================================ */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* ================================================================
   TEMPLATE DATA
   Single source of truth — passed to every render call.
================================================================ */
const siteData = {
  meta: {
    title:       'Sharikh Naveed · CuzzyCrew',
    description: 'Pakistani creator. Accent comedy, lifestyle, and street culture. 80K+ followers.',
    url:         process.env.SITE_URL || 'https://cuzzycrew.com',
  },
  creator: {
    name:      'Sharikh Naveed',
    handle:    '@sharikh_naveed',
    igUrl:     'https://www.instagram.com/sharikh_naveed/',
    tagline:   'Sharikh Naveed · CuzzyCrew',
    bio: [
      'Born in Pakistan. Grew up on Italian cinema and New York culture. Sharikh makes accent comedy, lifestyle, and street content that\'s hard to put in a box.',
      '80K+ followers, real engagement, 40+ countries. Brands get an organic placement, not a banner ad.',
    ],
    quote:      '"I don\'t make content. I make people feel like they\'re with the crew."',
    stats: [
      { value: '500K', label: 'Total Reach' },
      { value: '8.4%', label: 'Engagement Rate' },
      { value: '40+',  label: 'Countries' },
      { value: '200+', label: 'Reels Published' },
    ],
    miniStats: [
      { value: 'PKR 180K', label: 'Top Deal Value' },
      { value: '2023',     label: 'Active Since' },
      { value: '3',        label: 'Platforms' },
      { value: '100%',     label: 'Authentic' },
    ],
  },
  niches: [
    { num: 'I',   title: 'Accent Comedy',      desc: 'The signature. Italian-NY-Pakistani fusion, unmistakably Sharikh. Every video built around the bit.' },
    { num: 'II',  title: 'Lifestyle',           desc: 'Street culture, food, fashion, everyday moments. Shot clean, edited sharp, kept real.' },
    { num: 'III', title: 'Brand Integration',   desc: 'Products work when they fit the story. Organic placements, not forced reads. The audience notices the difference.' },
    { num: 'IV',  title: 'Reels & Shorts',      desc: '200+ short-form videos. Strong hooks, high retention, consistent posting cadence.' },
    { num: 'V',   title: 'Story Campaigns',     desc: 'Multi-frame story series with real click-through. Built around narrative, not just product shots.' },
    { num: 'VI',  title: 'Full Campaigns',      desc: 'Strategy, scripting, filming, delivery, and reporting. End to end.' },
  ],
  platforms: [
    {
      name:      'Instagram',
      reachPct:  68,
      engLabel:  'Engagement',
      engVal:    '8.4%',
      engPct:    84,
      desc:      'Primary platform. Reels, Stories, and collabs. Highest engagement and conversion.',
    },
    {
      name:      'TikTok',
      reachPct:  45,
      engLabel:  'Engagement',
      engVal:    '6.1%',
      engPct:    61,
      desc:      'Growing. Accent content works well here. Cross-posted for wider reach.',
    },
    {
      name:      'YouTube',
      reachPct:  22,
      engLabel:  'Watch Retention',
      engVal:    '74%',
      engPct:    74,
      desc:      'Shorts and long-form. Good watch retention. Better for in-depth content.',
    },
  ],
  shopUrl:    process.env.SHOP_URL || 'https://shop.cuzzycrew.com',
  year:       new Date().getFullYear(),
};

/* ================================================================
   INSTAGRAM FOLLOWER CACHE
   Uses Instagram's internal web_profile_info endpoint — the same
   call the instagram.com frontend makes. TTL = 5 minutes.
================================================================ */
let igCache = { count: null, fetchedAt: 0 };
const IG_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Instagram's own web app ID — public, embedded in every IG page
const IG_APP_ID = '936619743392459';

async function fetchIgFollowers() {
  const now = Date.now();
  if (igCache.count !== null && now - igCache.fetchedAt < IG_TTL_MS) {
    return igCache.count;
  }

  // Strategy 1: Instagram private web API (used by instagram.com itself)
  try {
    const apiUrl = 'https://i.instagram.com/api/v1/users/web_profile_info/?username=sharikh_naveed';
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://www.instagram.com/',
        'Origin':          'https://www.instagram.com',
        'x-ig-app-id':     IG_APP_ID,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const json = await res.json();
      const count = json?.data?.user?.edge_followed_by?.count;
      if (count != null) {
        igCache = { count, fetchedAt: now };
        console.log(`[IG] followers: ${count}`);
        return count;
      }
    }
  } catch (err) {
    console.warn('[IG] api v1 failed:', err.message);
  }

  // Strategy 2: Public profile page scrape with full browser headers
  try {
    const res = await fetch('https://www.instagram.com/sharikh_naveed/', {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control':   'no-cache',
        'Pragma':          'no-cache',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const html = await res.text();

      // Pattern 1: GraphQL JSON blob
      let m = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
      if (m) {
        igCache = { count: parseInt(m[1], 10), fetchedAt: now };
        return igCache.count;
      }

      // Pattern 2: meta description "X Followers"
      m = html.match(/([\d,]+)\s+Followers/i);
      if (m) {
        igCache = { count: parseInt(m[1].replace(/,/g, ''), 10), fetchedAt: now };
        return igCache.count;
      }
    }
  } catch (err) {
    console.warn('[IG] profile scrape failed:', err.message);
  }

  // Keep stale cache value if we have one — better than showing fallback
  if (igCache.count !== null) return igCache.count;

  return null; // caller shows "500K+" fallback
}

function formatCount(n) {
  if (!n) return '500K+';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

/* ================================================================
   ROUTES
================================================================ */

// GET /
app.get('/', async (req, res) => {
  const rawCount    = await fetchIgFollowers();
  const igFollowers = formatCount(rawCount);

  res.render('index', { ...siteData, igFollowers });
});

// POST /api/views/:section — track section impressions (fired by Intersection Observer)
app.post('/api/views/:section', (req, res) => {
  const section = req.params.section.replace(/[^a-z0-9-_]/gi, '').slice(0, 60);
  if (!section) return res.status(400).json({ ok: false });
  const views = readJSON(VIEWS_FILE, {});
  views[section] = (views[section] || 0) + 1;
  writeJSON(VIEWS_FILE, views);
  res.json({ ok: true, section, count: views[section] });
});

// GET /api/stats — view counts + subscriber total (admin use)
app.get('/api/stats', (req, res) => {
  const views = readJSON(VIEWS_FILE, {});
  const subs  = readJSON(SUBS_FILE, []);
  res.json({ views, subscribers: subs.length });
});

// POST /join — mailing list signup
app.post('/join', (req, res) => {
  const { email } = req.body;
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) {
    return res.status(400).json({ ok: false, error: 'Valid email address required.' });
  }
  const subs = readJSON(SUBS_FILE, []);
  const already = subs.includes(email.toLowerCase());
  if (!already) {
    subs.push(email.toLowerCase());
    writeJSON(SUBS_FILE, subs);
    console.log('[Join] new subscriber:', email);
  }
  res.json({ ok: true, already });
});

// GET /api/followers  — JSON endpoint for client-side refresh
app.get('/api/followers', async (req, res) => {
  const raw   = await fetchIgFollowers();
  const count = formatCount(raw);
  res.json({ count, raw: raw ?? null });
});

// POST /contact — collab enquiry form submission
app.post('/contact', (req, res) => {
  const { brand, email, package: pkg, message } = req.body;

  // Basic server-side validation
  if (!brand || !email || !message) {
    return res.status(400).render('index', {
      ...siteData,
      igFollowers:   formatCount(igCache.count),
      formError:     'Please fill in all required fields.',
      formScrollTo:  true,
    });
  }

  // Validate email format
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return res.status(400).render('index', {
      ...siteData,
      igFollowers:   formatCount(igCache.count),
      formError:     'Please enter a valid email address.',
      formScrollTo:  true,
    });
  }

  // In production: wire up Nodemailer / SendGrid / Resend here.
  // For now, log the submission and confirm to the user.
  console.log('[Contact]', { brand, email, pkg, message: message.slice(0, 80) });

  res.render('index', {
    ...siteData,
    igFollowers:   formatCount(igCache.count),
    formSuccess:   true,
    formScrollTo:  true,
  });
});

// 404 — catch-all
app.use((req, res) => {
  res.status(404).render('404', { ...siteData });
});

// 500 — error handler
app.use((err, req, res, _next) => {
  console.error('[Error]', err);
  res.status(500).render('500', { ...siteData });
});

/* ================================================================
   START SERVER
================================================================ */
app.listen(PORT, () => {
  console.log(`\n  CuzzyCrew running → http://localhost:${PORT}\n`);
  // Warm the IG cache on startup
  fetchIgFollowers().then((n) =>
    console.log(`  [IG] cached followers: ${formatCount(n)}`)
  );
});
