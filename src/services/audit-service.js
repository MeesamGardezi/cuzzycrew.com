'use strict';

const { randomToken } = require('../utils/crypto');
const { nowIso } = require('../utils/time');

class AuditService {
  constructor(store, limit) {
    this.store = store;
    this.limit = limit;
  }

  async log(type, details = {}) {
    const entry = {
      id: randomToken(8),
      type,
      createdAt: nowIso(),
      ...details,
    };

    await this.store.update((state) => {
      state.events.push(entry);
      if (state.events.length > this.limit) {
        state.events = state.events.slice(-this.limit);
      }
      return state;
    });

    return entry;
  }

  async listRecent(limit = 100) {
    const state = await this.store.get();
    return state.events.slice(-limit).reverse();
  }
}

module.exports = {
  AuditService,
};
