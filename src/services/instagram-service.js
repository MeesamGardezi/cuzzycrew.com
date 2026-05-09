'use strict';

const fs = require('fs');
const path = require('path');

const fetch = require('node-fetch');

const IG_APP_ID = '936619743392459';
const DATA_FILE = path.join(process.cwd(), 'data', 'ig-followers.json');
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function formatCount(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}

function parseCompactCount(input) {
  const value = String(input || '').trim().toUpperCase();
  const match = value.match(/^(\d+(?:\.\d+)?)([KM]?)$/);
  if (!match) return null;

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;

  if (match[2] === 'M') return Math.round(base * 1_000_000);
  if (match[2] === 'K') return Math.round(base * 1_000);
  return Math.round(base);
}

function extractFollowersFromHtml(html) {
  if (!html) return null;

  let match = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
  if (match) return Number.parseInt(match[1], 10);

  const ogDescription = html.match(/og:description"\s+content="([^"]+)"/i);
  if (ogDescription) {
    match = ogDescription[1].match(/([\d,.]+[KM]?)\s+Followers/i);
    if (match) {
      return parseCompactCount(match[1].replace(/,/g, ''));
    }
  }

  match = html.match(/([\d,.]+[KM]?)\s+Followers/i);
  if (match) {
    return parseCompactCount(match[1].replace(/,/g, ''));
  }

  return null;
}

class InstagramService {
  constructor(options = {}) {
    this.disableExternalFetch = options.disableExternalFetch;
    this.fallbackCount = Number.isFinite(options.fallbackCount) ? options.fallbackCount : 98_000;
    this.cache = { count: null, posts: null, fetchedAt: 0 };
    this.ttlMs = TWO_HOURS_MS;
    this._loadPersistedCache();
  }

  async fetchFollowers() {
    if (this.disableExternalFetch) return null;

    const now = Date.now();
    if (this.cache.count !== null && now - this.cache.fetchedAt < this.ttlMs) {
      return this.cache.count;
    }

    try {
      const apiUrl = 'https://i.instagram.com/api/v1/users/web_profile_info/?username=sharikh_naveed';
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.instagram.com/',
          Origin: 'https://www.instagram.com',
          'x-ig-app-id': IG_APP_ID,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json();
        const user = json?.data?.user;
        const count = user?.edge_followed_by?.count;
        const edges = user?.edge_owner_to_timeline_media?.edges || [];
        const posts = edges
          .slice(0, 3)
          .map(e => e?.node?.shortcode)
          .filter(Boolean)
          .map(code => `https://www.instagram.com/p/${code}/`);
        if (count != null) {
          this.cache = { count, posts: posts.length ? posts : null, fetchedAt: now };
          this._persistCache();
          return count;
        }
      }
    } catch (_error) {
      // Keep the experience resilient and fall through to the page scrape.
    }

    const htmlHeaderProfiles = [
      {
        // A minimal profile often returns static OG metadata including follower count.
        'User-Agent': 'Mozilla/5.0',
        Accept: '*/*',
      },
      {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    ];

    for (const headers of htmlHeaderProfiles) {
      try {
        const res = await fetch('https://www.instagram.com/sharikh_naveed/', {
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) continue;
        const html = await res.text();
        const raw = extractFollowersFromHtml(html);
        if (raw != null) {
          this.cache = { count: raw, fetchedAt: now };
          this._persistCache();
          return raw;
        }
      } catch (_error) {
        // Try the next HTML profile before falling back.
      }
    }

    try {
      const res = await fetch('https://www.instagram.com/sharikh_naveed/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const html = await res.text();
        const raw = extractFollowersFromHtml(html);
        if (raw != null) {
          this.cache = { count: raw, fetchedAt: now };
          this._persistCache();
          return raw;
        }
      }
    } catch (_error) {
      // Preserve the stale cache or fallback label below.
    }

    // Last resort: headless browser (works even when IG blocks plain HTTP requests).
    try {
      const count = await this._fetchViaHeadless();
      if (count != null) {
        this.cache = { count, fetchedAt: now };
        this._persistCache();
        return count;
      }
    } catch (_error) {
      // Headless not available or failed — return whatever we have.
    }

    return this.cache.count;
  }

  _loadPersistedCache() {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Number.isFinite(parsed.count) && parsed.count > 0) {
        this.cache = { count: parsed.count, posts: null, fetchedAt: parsed.fetchedAt || 0 };
      }
    } catch (_) {
      // File doesn't exist yet — fine, we'll create it on first successful fetch.
    }
  }

  _persistCache() {
    try {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify({ count: this.cache.count, fetchedAt: this.cache.fetchedAt }),
        'utf8'
      );
    } catch (_) {
      // Non-critical — carry on without persistence.
    }
  }

  async _fetchViaHeadless() {
    let chromiumLauncher;
    try {
      chromiumLauncher = require('playwright').chromium;
    } catch (_) {
      return null; // playwright not installed
    }

    let browser;
    try {
      browser = await chromiumLauncher.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage();
      await page.goto('https://www.instagram.com/sharikh_naveed/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      const metaContent = await page.evaluate(() => {
        const m =
          document.querySelector('meta[name="description"]') ||
          document.querySelector('meta[property="og:description"]');
        return m ? m.getAttribute('content') : null;
      });

      if (metaContent) {
        const match = metaContent.match(/([\d,.]+[KM]?)\s+Followers/i);
        if (match) return parseCompactCount(match[1].replace(/,/g, ''));
      }
      return null;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  startBackgroundRefresh() {
    if (this.disableExternalFetch) return;
    // Initial fetch shortly after app starts.
    setTimeout(() => this.fetchFollowers().catch(() => {}), 5000);
    // Refresh every 2 hours.
    setInterval(() => this.fetchFollowers().catch(() => {}), TWO_HOURS_MS);
  }

  async getDisplayCount() {
    const data = await this.getFollowerData();
    return data.count;
  }

  async getFollowerData() {
    const raw = await this.fetchFollowers();
    if (raw != null) {
      return {
        raw,
        count: formatCount(raw),
        isLive: true,
      };
    }

    return {
      raw: null,
      count: formatCount(this.fallbackCount),
      isLive: false,
    };
  }
}

module.exports = {
  InstagramService,
  formatCount,
};
