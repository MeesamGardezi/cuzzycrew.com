'use strict';

const { hashValue } = require('../utils/crypto');
const { getClientIp, isPrivateIp } = require('../utils/request');
const { nowIso } = require('../utils/time');

function normalizeLocation(source, value) {
  return {
    source,
    country: String(value.country || 'Unknown').slice(0, 80),
    region: String(value.region || '').slice(0, 120),
    city: String(value.city || '').slice(0, 120),
    ipClass: value.ipClass || 'unknown',
    resolvedAt: value.resolvedAt || nowIso(),
  };
}

class GeoService {
  constructor(options) {
    this.store = options.store;
    this.secret = options.secret;
    this.limit = options.limit;
    this.trustProxy = options.trustProxy;
  }

  hashIp(ip) {
    return ip ? hashValue(ip, this.secret) : '';
  }

  readProxyLocation(req) {
    if (!this.trustProxy) return null;

    const country = req.get('x-vercel-ip-country') || req.get('cf-ipcountry') || '';
    const region = req.get('x-vercel-ip-country-region') || '';
    const city = req.get('x-vercel-ip-city') || '';

    if (!country || country === 'XX') return null;

    return normalizeLocation('proxy-header', {
      country,
      region,
      city,
      ipClass: 'public',
    });
  }

  async resolve(req) {
    const ip = getClientIp(req);
    const ipHash = this.hashIp(ip);

    if (!ip || isPrivateIp(ip)) {
      return normalizeLocation('offline-private', {
        country: 'Unknown',
        region: '',
        city: '',
        ipClass: 'private',
      });
    }

    const cacheState = await this.store.get();
    const cached = cacheState.entries[ipHash];
    if (cached) {
      return normalizeLocation('cache', cached);
    }

    const proxyLocation = this.readProxyLocation(req);
    if (proxyLocation) {
      await this.store.update((state) => {
        state.entries[ipHash] = proxyLocation;
        const keys = Object.keys(state.entries);
        if (keys.length > this.limit) {
          delete state.entries[keys[0]];
        }
        return state;
      });
      return proxyLocation;
    }

    return normalizeLocation('offline-unknown', {
      country: 'Unknown',
      region: '',
      city: '',
      ipClass: 'public',
    });
  }
}

module.exports = {
  GeoService,
};
