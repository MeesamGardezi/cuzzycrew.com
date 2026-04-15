'use strict';

const path = require('path');

function readInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(value, fallback) {
  if (value == null) return fallback;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

function createConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';
  const dataDir = env.DATA_DIR || path.join(process.cwd(), 'data');
  const sessionSecret = env.SESSION_SECRET || (isProduction ? '' : 'cuzzycrew-dev-session-secret');
  const adminUsername = env.ADMIN_USERNAME || (isProduction ? '' : 'admin');
  const adminPassword = env.ADMIN_PASSWORD || (isProduction ? '' : 'cuzzycrew-local-only');

  if (isProduction) {
    if (!sessionSecret) {
      throw new Error('SESSION_SECRET is required in production.');
    }
    if (!adminUsername || !adminPassword) {
      throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required in production.');
    }
  }

  return {
    nodeEnv,
    isProduction,
    isTest,
    port: readInt(env.PORT, 3000),
    dataDir,
    sessionSecret,
    visitorSalt: env.VISITOR_SALT || sessionSecret || 'cuzzycrew-dev-visitor-salt',
    adminUsername,
    adminPassword,
    adminCookieName: env.ADMIN_COOKIE_NAME || 'cc_admin_session',
    siteUrl: env.SITE_URL || 'https://cuzzycrew.com',
    shopUrl: env.SHOP_URL || 'https://shop.cuzzycrew.com',
    trustProxy: readBool(env.TRUST_PROXY, false),
    sessionIdleMinutes: readInt(env.ADMIN_SESSION_IDLE_MINUTES, 30),
    sessionAbsoluteMinutes: readInt(env.ADMIN_SESSION_ABSOLUTE_MINUTES, 8 * 60),
    loginWindowMinutes: readInt(env.ADMIN_LOGIN_WINDOW_MINUTES, 15),
    loginMaxAttempts: readInt(env.ADMIN_LOGIN_MAX_ATTEMPTS, 5),
    loginLockMinutes: readInt(env.ADMIN_LOGIN_LOCK_MINUTES, 15),
    adminApiWindowMinutes: readInt(env.ADMIN_API_WINDOW_MINUTES, 5),
    adminApiMaxRequests: readInt(env.ADMIN_API_MAX_REQUESTS, 120),
    adminPageWindowMinutes: readInt(env.ADMIN_PAGE_WINDOW_MINUTES, 5),
    adminPageMaxRequests: readInt(env.ADMIN_PAGE_MAX_REQUESTS, 240),
    analyticsEventLimit: readInt(env.ANALYTICS_EVENT_LIMIT, 5000),
    auditEventLimit: readInt(env.AUDIT_EVENT_LIMIT, 2000),
    geoCacheLimit: readInt(env.GEO_CACHE_LIMIT, 2000),
    disableExternalFetch: readBool(env.DISABLE_EXTERNAL_FETCH, false),
    instagramFollowersFallback: readInt(env.INSTAGRAM_FOLLOWERS_FALLBACK, 80000),
  };
}

module.exports = {
  createConfig,
};
