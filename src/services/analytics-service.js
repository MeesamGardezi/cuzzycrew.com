'use strict';

const { randomToken, hashValue } = require('../utils/crypto');
const { nowIso, toIsoDate } = require('../utils/time');
const { getClientIp, getUserAgent } = require('../utils/request');

function classifyDevice(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/(bot|crawl|spider|headless|slurp)/.test(ua)) return 'bot';
  if (/(ipad|tablet)/.test(ua)) return 'tablet';
  if (/(iphone|android|mobile)/.test(ua)) return 'mobile';
  return 'desktop';
}

function classifyAgent(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (ua.includes('edg')) return 'Edge';
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('firefox')) return 'Firefox';
  return 'Other';
}

function createRange(query = {}) {
  const range = query.range || '7d';
  const now = new Date();
  let from;
  let to = new Date(now);

  if (range === 'today') {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else if (range === '30d') {
    from = new Date(now.getTime() - (29 * 24 * 60 * 60 * 1000));
  } else if (range === 'custom' && query.from && query.to) {
    from = new Date(`${query.from}T00:00:00.000Z`);
    to = new Date(`${query.to}T23:59:59.999Z`);
  } else {
    from = new Date(now.getTime() - (6 * 24 * 60 * 60 * 1000));
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    from = new Date(now.getTime() - (6 * 24 * 60 * 60 * 1000));
    to = now;
  }

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    fromDate: from,
    toDate: to,
  };
}

function percentChange(current, previous) {
  if (previous === 0) {
    return current === 0 ? '0.0' : '100.0';
  }
  return (((current - previous) / previous) * 100).toFixed(1);
}

function createPreviousRange(range) {
  const durationMs = range.toDate.getTime() - range.fromDate.getTime() + 1;
  const previousToDate = new Date(range.fromDate.getTime() - 1);
  const previousFromDate = new Date(previousToDate.getTime() - durationMs + 1);

  return {
    fromDate: previousFromDate,
    toDate: previousToDate,
  };
}

class AnalyticsService {
  constructor(options) {
    this.store = options.store;
    this.geoService = options.geoService;
    this.secret = options.secret;
    this.eventLimit = options.eventLimit;
  }

  buildVisitorId(req) {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    return hashValue(`${ip}|${classifyDevice(ua)}|${classifyAgent(ua)}`, this.secret);
  }

  async track(req, type, details = {}) {
    const createdAt = nowIso();
    const location = await this.geoService.resolve(req);
    const userAgent = getUserAgent(req);
    const visitorId = this.buildVisitorId(req);
    const event = {
      id: randomToken(8),
      type,
      createdAt,
      dateKey: toIsoDate(createdAt),
      visitorId,
      device: classifyDevice(userAgent),
      agent: classifyAgent(userAgent),
      section: details.section || '',
      source: details.source || 'site',
      country: location.country,
      region: location.region,
      city: location.city,
      locationSource: location.source,
      ipClass: location.ipClass,
    };

    await this.store.update((state) => {
      state.events.push(event);
      if (state.events.length > this.eventLimit) {
        state.events = state.events.slice(-this.eventLimit);
      }

      state.rollups.daily[event.dateKey] = state.rollups.daily[event.dateKey] || {
        page_view: 0,
        section_view: 0,
        join: 0,
        contact: 0,
      };
      state.rollups.daily[event.dateKey][type] = (state.rollups.daily[event.dateKey][type] || 0) + 1;

      if (event.section) {
        state.rollups.sections[event.section] = (state.rollups.sections[event.section] || 0) + 1;
      }

      if (type === 'join' || type === 'contact') {
        state.rollups.conversions[type] = (state.rollups.conversions[type] || 0) + 1;
      }

      return state;
    });

    return event;
  }

  async getSummary(query = {}) {
    const range = createRange(query);
    const previousRange = createPreviousRange(range);
    const state = await this.store.get();

    const events = state.events.filter((event) => {
      const createdAt = new Date(event.createdAt);
      return createdAt >= range.fromDate && createdAt <= range.toDate;
    });

    const previousEvents = state.events.filter((event) => {
      const createdAt = new Date(event.createdAt);
      return createdAt >= previousRange.fromDate && createdAt <= previousRange.toDate;
    });

    const pageViews = events.filter((event) => event.type === 'page_view');
    const joins = events.filter((event) => event.type === 'join');
    const contacts = events.filter((event) => event.type === 'contact');
    const sectionViews = events.filter((event) => event.type === 'section_view');
    const previousPageViews = previousEvents.filter((event) => event.type === 'page_view');
    const previousJoins = previousEvents.filter((event) => event.type === 'join');
    const previousContacts = previousEvents.filter((event) => event.type === 'contact');

    const uniqueVisitors = new Set(pageViews.map((event) => event.visitorId));
    const days = {};

    for (const event of events) {
      days[event.dateKey] = days[event.dateKey] || {
        date: event.dateKey,
        visits: 0,
        joins: 0,
        contacts: 0,
      };
      if (event.type === 'page_view') days[event.dateKey].visits += 1;
      if (event.type === 'join') days[event.dateKey].joins += 1;
      if (event.type === 'contact') days[event.dateKey].contacts += 1;
    }

    const aggregateTop = (items, keyBuilder) => {
      const buckets = new Map();
      for (const item of items) {
        const key = keyBuilder(item);
        if (!key || key === 'Unknown') continue;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      return Array.from(buckets.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 8);
    };

    const topSources = aggregateTop(pageViews, (event) => event.source || 'site');
    const knownLocationVisits = pageViews.filter((event) => event.country && event.country !== 'Unknown').length;
    const leadCount = joins.length + contacts.length;
    const geoCoverageRate = pageViews.length ? ((knownLocationVisits / pageViews.length) * 100).toFixed(1) : '0.0';

    const dailyTrend = Object.values(days).sort((left, right) => left.date.localeCompare(right.date));
    const peakDay = dailyTrend.reduce((best, day) => (day.visits > best.visits ? day : best), {
      date: '',
      visits: 0,
      joins: 0,
      contacts: 0,
    });

    return {
      range: {
        range: range.range,
        from: range.from,
        to: range.to,
      },
      kpis: {
        totalVisits: pageViews.length,
        uniqueVisitors: uniqueVisitors.size,
        joinConversions: joins.length,
        contactConversions: contacts.length,
        visitToJoinRate: pageViews.length ? ((joins.length / pageViews.length) * 100).toFixed(1) : '0.0',
        visitToContactRate: pageViews.length ? ((contacts.length / pageViews.length) * 100).toFixed(1) : '0.0',
      },
      comparison: {
        previousVisits: previousPageViews.length,
        previousJoinConversions: previousJoins.length,
        previousContactConversions: previousContacts.length,
        visitsDeltaPct: percentChange(pageViews.length, previousPageViews.length),
        joinsDeltaPct: percentChange(joins.length, previousJoins.length),
        contactsDeltaPct: percentChange(contacts.length, previousContacts.length),
      },
      funnel: {
        visits: pageViews.length,
        joins: joins.length,
        contacts: contacts.length,
        leads: leadCount,
        visitToLeadRate: pageViews.length ? ((leadCount / pageViews.length) * 100).toFixed(1) : '0.0',
      },
      quality: {
        eventsPerVisitor: uniqueVisitors.size ? (events.length / uniqueVisitors.size).toFixed(2) : '0.0',
        sectionViewsPerVisit: pageViews.length ? (sectionViews.length / pageViews.length).toFixed(2) : '0.0',
        leadsPerThousandVisits: pageViews.length ? ((leadCount / pageViews.length) * 1000).toFixed(1) : '0.0',
        geoCoverageRate,
      },
      peakDay,
      dailyTrend,
      topCountries: aggregateTop(pageViews, (event) => event.country),
      topLocations: aggregateTop(pageViews, (event) => [event.city, event.region, event.country].filter(Boolean).join(', ')),
      topSources,
      sectionPerformance: aggregateTop(sectionViews, (event) => event.section),
      deviceSummary: aggregateTop(pageViews, (event) => event.device),
      agentSummary: aggregateTop(pageViews, (event) => event.agent),
      recentEvents: events.slice(-20).reverse(),
    };
  }
}

module.exports = {
  AnalyticsService,
  createRange,
};
