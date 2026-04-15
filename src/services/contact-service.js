'use strict';

const { randomToken, hashValue } = require('../utils/crypto');
const { nowIso, clamp } = require('../utils/time');
const { CONTACT_STATUS_VALUES, normalizeMultilineText, normalizeStatus, normalizeTags, normalizeText } = require('../utils/validation');

function scoreSpam(message, email) {
  const flags = [];
  const normalized = String(message || '');
  const urlCount = (normalized.match(/https?:\/\//gi) || []).length;
  if (urlCount >= 2) flags.push('many_links');
  if (/[A-Z]{12,}/.test(normalized)) flags.push('shouting');
  if (/whatsapp|telegram|crypto|seo|backlink|casino/i.test(normalized)) flags.push('spam_terms');
  if ((normalized.match(/!/g) || []).length >= 6) flags.push('excess_punctuation');
  if (String(email || '').endsWith('@example.com')) flags.push('placeholder_email');

  return {
    score: flags.length,
    flags,
  };
}

class ContactService {
  constructor(options) {
    this.store = options.store;
    this.auditService = options.auditService;
    this.secret = options.secret;
  }

  buildMessageHash(payload) {
    return hashValue(`${payload.brand}|${payload.email}|${payload.message}`, this.secret);
  }

  async createFromPublic(payload, context) {
    const createdAt = nowIso();
    const spam = scoreSpam(payload.message, payload.email);
    const messageHash = this.buildMessageHash(payload);
    let duplicateOf = '';

    await this.store.update((state) => {
      const duplicate = state.items.find((item) =>
        item.messageHash === messageHash &&
        Math.abs(new Date(item.createdAt).getTime() - new Date(createdAt).getTime()) < (24 * 60 * 60 * 1000));

      duplicateOf = duplicate ? duplicate.id : '';

      state.items.push({
        id: randomToken(8),
        brand: payload.brand,
        email: payload.email,
        packageInterest: payload.packageInterest,
        message: payload.message,
        messageHash,
        createdAt,
        updatedAt: createdAt,
        status: spam.score >= 2 ? 'spam' : 'new',
        notes: [],
        tags: normalizeTags([duplicate ? 'duplicate' : '', ...spam.flags]),
        source: 'public_contact_form',
        ipMetadata: context.ipMetadata,
        userAgent: context.userAgent,
        spamScore: spam.score,
        spamFlags: spam.flags,
        duplicateOf,
      });
      return state;
    });

    await this.auditService.log('contact.created', {
      actor: 'public',
      email: payload.email,
      brand: payload.brand,
      duplicateOf,
      spamScore: spam.score,
    });
  }

  async list(query = {}) {
    const state = await this.store.get();
    const search = normalizeText(query.q || '', 120).toLowerCase();
    const rawStatus = normalizeText(query.status || '', 20).toLowerCase();
    const status = CONTACT_STATUS_VALUES.includes(rawStatus) ? rawStatus : '';
    const pkg = normalizeText(query.package || '', 120).toLowerCase();
    const sort = normalizeText(query.sort || 'newest', 20).toLowerCase();
    const pageSize = clamp(Number.parseInt(query.pageSize, 10) || 12, 1, 100);
    let results = state.items.slice();

    if (search) {
      results = results.filter((item) => {
        const haystack = `${item.brand} ${item.email} ${item.message}`.toLowerCase();
        return haystack.includes(search);
      });
    }

    if (status) {
      results = results.filter((item) => item.status === status);
    }

    if (pkg) {
      results = results.filter((item) => String(item.packageInterest || '').toLowerCase().includes(pkg));
    }

    if (query.from) {
      const from = new Date(`${query.from}T00:00:00.000Z`);
      results = results.filter((item) => new Date(item.createdAt) >= from);
    }

    if (query.to) {
      const to = new Date(`${query.to}T23:59:59.999Z`);
      results = results.filter((item) => new Date(item.createdAt) <= to);
    }

    results.sort((left, right) => {
      if (sort === 'status') return left.status.localeCompare(right.status) || right.createdAt.localeCompare(left.createdAt);
      if (sort === 'oldest') return left.createdAt.localeCompare(right.createdAt);
      return right.createdAt.localeCompare(left.createdAt);
    });

    const total = results.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = clamp(Number.parseInt(query.page, 10) || 1, 1, totalPages);
    const start = (page - 1) * pageSize;

    return {
      items: results.slice(start, start + pageSize),
      total,
      totalPages,
      page,
      pageSize,
      counts: state.items.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  async getById(id) {
    const state = await this.store.get();
    return state.items.find((item) => item.id === id) || null;
  }

  async updateStatus(id, input, actor) {
    const status = normalizeStatus(input.status);
    const tags = normalizeTags(input.tags);
    const note = normalizeMultilineText(input.note, 1200);
    let updated = null;

    await this.store.update((state) => {
      const item = state.items.find((entry) => entry.id === id);
      if (!item) return state;
      item.status = status;
      item.tags = tags;
      item.updatedAt = nowIso();
      if (note) {
        item.notes.push({
          id: randomToken(6),
          body: note,
          createdAt: item.updatedAt,
          author: actor,
        });
      }
      updated = item;
      return state;
    });

    if (updated) {
      await this.auditService.log('contact.updated', {
        actor,
        contactId: id,
        status,
      });
    }

    return updated;
  }

  async addNote(id, note, actor) {
    return this.updateStatus(id, { status: 'new', tags: [], note }, actor);
  }

  async bulkUpdate(ids, status, actor) {
    const normalizedIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
    const normalizedStatus = normalizeStatus(status);
    let changed = 0;

    await this.store.update((state) => {
      for (const item of state.items) {
        if (!normalizedIds.includes(item.id)) continue;
        item.status = normalizedStatus;
        item.updatedAt = nowIso();
        changed += 1;
      }
      return state;
    });

    await this.auditService.log('contact.bulk_update', {
      actor,
      count: changed,
      status: normalizedStatus,
    });

    return changed;
  }
}

module.exports = {
  ContactService,
};
