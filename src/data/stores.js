'use strict';

const path = require('path');
const { JsonStore, mergeDefaults } = require('./json-store');

function createStores(config) {
  const baseDir = config.dataDir;

  return {
    views: new JsonStore({
      filePath: path.join(baseDir, 'views.json'),
      defaults: {},
      migrate: (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
    }),
    subscribers: new JsonStore({
      filePath: path.join(baseDir, 'subscribers.json'),
      defaults: [],
      migrate: (value) => (Array.isArray(value) ? value : []),
    }),
    contacts: new JsonStore({
      filePath: path.join(baseDir, 'contacts.json'),
      defaults: {
        version: 1,
        items: [],
      },
      migrate: (value, defaults) => {
        const base = mergeDefaults(defaults, value);
        base.items = Array.isArray(base.items) ? base.items : [];
        return base;
      },
    }),
    auth: new JsonStore({
      filePath: path.join(baseDir, 'auth.json'),
      defaults: {
        version: 1,
        sessions: {},
        login: {
          attempts: {},
        },
      },
      migrate: (value, defaults) => mergeDefaults(defaults, value),
    }),
    analytics: new JsonStore({
      filePath: path.join(baseDir, 'analytics.json'),
      defaults: {
        version: 1,
        events: [],
        rollups: {
          daily: {},
          sections: {},
          conversions: {
            join: 0,
            contact: 0,
          },
        },
      },
      migrate: (value, defaults) => {
        const base = mergeDefaults(defaults, value);
        base.events = Array.isArray(base.events) ? base.events : [];
        return base;
      },
    }),
    geoCache: new JsonStore({
      filePath: path.join(baseDir, 'geo-cache.json'),
      defaults: {
        version: 1,
        entries: {},
      },
      migrate: (value, defaults) => mergeDefaults(defaults, value),
    }),
    audit: new JsonStore({
      filePath: path.join(baseDir, 'audit.json'),
      defaults: {
        version: 1,
        events: [],
      },
      migrate: (value, defaults) => {
        const base = mergeDefaults(defaults, value);
        base.events = Array.isArray(base.events) ? base.events : [];
        return base;
      },
    }),
  };
}

async function initializeStores(stores) {
  await Promise.all(Object.values(stores).map((store) => store.ready));
}

module.exports = {
  createStores,
  initializeStores,
};
