'use strict';

const fetch = require('node-fetch');

const IG_APP_ID = '936619743392459';

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
    this.fallbackCount = Number.isFinite(options.fallbackCount) ? options.fallbackCount : 86_100;
    this.cache = { count: null, fetchedAt: 0 };
    this.ttlMs = 5 * 60 * 1000;
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
        const count = json?.data?.user?.edge_followed_by?.count;
        if (count != null) {
          this.cache = { count, fetchedAt: now };
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
          return raw;
        }
      }
    } catch (_error) {
      // Preserve the stale cache or fallback label below.
    }

    return this.cache.count;
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
