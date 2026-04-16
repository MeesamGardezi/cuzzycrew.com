'use strict';

const express = require('express');
const { CONTACT_STATUS_VALUES, normalizeTags, normalizeText } = require('../utils/validation');
const { toCsv } = require('../utils/csv');

const CONTACT_MESSAGES = {
  bulk_empty: 'Select at least one contact before applying a bulk update.',
  bulk_updated: 'Selected contacts were updated.',
};

const DETAIL_MESSAGES = {
  updated: 'Contact workflow was updated.',
};

function buildAdminViewModel(siteData, pageTitle, activePage, extra = {}) {
  return {
    ...siteData,
    pageTitle,
    activePage,
    ...extra,
  };
}

function readStatusFilter(value) {
  const normalized = normalizeText(value || '', 20).toLowerCase();
  return CONTACT_STATUS_VALUES.includes(normalized) ? normalized : '';
}

function readSubscriberQuery(value) {
  return normalizeText(value || '', 120);
}

function readSubscriberDomain(value) {
  return normalizeText(value || '', 120).toLowerCase().replace(/^@+/, '');
}

function readSubscriberSort(value) {
  const normalized = normalizeText(value || '', 20).toLowerCase();
  return normalized === 'desc' ? 'desc' : 'asc';
}

function readUiMessage(value, dictionary) {
  const key = normalizeText(value || '', 40).toLowerCase();
  return dictionary[key] || '';
}

function safeAdminPath(value, fallback) {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith('/admin')) return fallback;

  try {
    const parsed = new URL(normalized, 'http://admin.local');
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';

    if (pathname === '/admin' || pathname === '/admin/analytics') {
      return pathname;
    }

    if (/^\/admin\/contacts\/[a-zA-Z0-9_-]+$/.test(pathname)) {
      return pathname;
    }

    if (pathname === '/admin/contacts') {
      const params = new URLSearchParams();
      const q = normalizeText(parsed.searchParams.get('q') || '', 120);
      const status = readStatusFilter(parsed.searchParams.get('status'));
      const packageFilter = normalizeText(parsed.searchParams.get('package') || '', 120);
      const from = normalizeText(parsed.searchParams.get('from') || '', 10);
      const to = normalizeText(parsed.searchParams.get('to') || '', 10);
      const sort = normalizeText(parsed.searchParams.get('sort') || '', 20).toLowerCase();
      const page = Number.parseInt(parsed.searchParams.get('page') || '', 10);

      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (packageFilter) params.set('package', packageFilter);
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) params.set('from', from);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) params.set('to', to);
      if (sort === 'newest' || sort === 'oldest' || sort === 'status') params.set('sort', sort);
      if (Number.isFinite(page) && page > 1) params.set('page', String(page));

      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    }
  } catch (_error) {
    return fallback;
  }

  return fallback;
}

function appendMessage(pathname, messageKey) {
  const separator = pathname.includes('?') ? '&' : '?';
  return `${pathname}${separator}msg=${encodeURIComponent(messageKey)}`;
}

function createOverviewInsights(summary, contacts) {
  const topSource = summary.topSources?.[0] || null;
  const topLocation = summary.topLocations?.[0] || null;
  const openContacts = (contacts.counts?.new || 0) + (contacts.counts?.in_review || 0);

  return {
    topSourceLabel: topSource ? topSource.label : 'No source data yet',
    topSourceValue: topSource ? topSource.value : 0,
    topLocationLabel: topLocation ? topLocation.label : 'No location data yet',
    topLocationValue: topLocation ? topLocation.value : 0,
    openContacts,
  };
}

function createAdminRouter(context) {
  const router = express.Router();
  const {
    config,
    siteData,
    services,
    middleware,
  } = context;
  const {
    analyticsService,
    auditService,
    authService,
    contactService,
  } = services;
  const {
    adminApiLimiter,
    adminPageLimiter,
    asyncHandler,
    attachSession,
    loginLimiter,
    noStore,
    requireAdmin,
    requireCsrf,
  } = middleware;

  router.use(noStore);
  router.use(attachSession);

  router.get('/login', asyncHandler(async (req, res) => {
    if (req.adminSession) return res.redirect('/admin');
    return res.render('admin/login', buildAdminViewModel(siteData, 'Admin Login', 'login', {
      loginError: '',
      csrfToken: '',
      devDefaults: config.isProduction ? null : {
        username: config.adminUsername,
        password: config.adminPassword,
      },
    }));
  }));

  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const username = normalizeText(req.body.username, 80);
    const password = String(req.body.password || '').slice(0, 200);
    const result = await authService.authenticate(req, username, password);

    if (!result.ok) {
      const loginError = result.locked
        ? `Too many attempts. Try again in ${config.loginLockMinutes} minutes.`
        : 'Invalid username or password.';

      return res.status(result.locked ? 429 : 401).render('admin/login', buildAdminViewModel(siteData, 'Admin Login', 'login', {
        loginError,
        csrfToken: '',
        devDefaults: config.isProduction ? null : {
          username: config.adminUsername,
          password: config.adminPassword,
        },
      }));
    }

    await authService.createSession(res, result.sessionId);
    return res.redirect('/admin');
  }));

  router.use(requireAdmin);
  router.use(adminPageLimiter);

  router.post('/logout', requireCsrf, asyncHandler(async (req, res) => {
    await authService.destroySession(req, res, 'manual_logout');
    return res.redirect('/admin/login');
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const summary = await analyticsService.getSummary({ range: '7d' });
    const contacts = await contactService.list({ page: 1, pageSize: 6, sort: 'newest' });

    return res.render('admin/dashboard', buildAdminViewModel(siteData, 'Admin Overview', 'overview', {
      summary,
      contacts,
      insights: createOverviewInsights(summary, contacts),
    }));
  }));

  router.get('/contacts', asyncHandler(async (req, res) => {
    const contacts = await contactService.list(req.query);
    const subscriberQuery = readSubscriberQuery(req.query.subscriberQ);
    const subscriberDomain = readSubscriberDomain(req.query.subscriberDomain);
    const subscriberSort = readSubscriberSort(req.query.subscriberSort);
    const subscriberSearch = subscriberQuery.toLowerCase();
    const allSubscribers = (await context.stores.subscribers.get())
      .map((email) => String(email || '').trim())
      .filter(Boolean);
    let filteredSubscribers = allSubscribers;

    if (subscriberSearch) {
      filteredSubscribers = filteredSubscribers.filter((email) => email.toLowerCase().includes(subscriberSearch));
    }

    if (subscriberDomain) {
      filteredSubscribers = filteredSubscribers.filter((email) => {
        const domain = email.toLowerCase().split('@')[1] || '';
        return domain.includes(subscriberDomain);
      });
    }

    filteredSubscribers.sort((left, right) => {
      return subscriberSort === 'desc'
        ? right.localeCompare(left)
        : left.localeCompare(right);
    });

    const subscriberLimit = 200;
    const totalContactLeads = Object.values(contacts.counts || {}).reduce((sum, count) => {
      return sum + (Number(count) || 0);
    }, 0);

    const filters = {
      q: req.query.q || '',
      status: readStatusFilter(req.query.status),
      package: normalizeText(req.query.package || '', 120),
      from: req.query.from || '',
      to: req.query.to || '',
      sort: normalizeText(req.query.sort || 'newest', 20),
      page: String(req.query.page || 1),
    };

    const currentQuery = new URLSearchParams(filters).toString();

    return res.render('admin/contacts', buildAdminViewModel(siteData, 'Contact Requests', 'contacts', {
      contacts,
      filters,
      currentQuery,
      leadSnapshot: {
        contactLeads: totalContactLeads,
        joinSubscribers: allSubscribers.length,
        combined: totalContactLeads + allSubscribers.length,
      },
      subscribers: {
        query: subscriberQuery,
        domain: subscriberDomain,
        sort: subscriberSort,
        total: allSubscribers.length,
        filteredTotal: filteredSubscribers.length,
        items: filteredSubscribers.slice(0, subscriberLimit),
        truncated: filteredSubscribers.length > subscriberLimit,
      },
      uiMessage: readUiMessage(req.query.msg, CONTACT_MESSAGES),
    }));
  }));

  router.get('/contacts/export.csv', asyncHandler(async (req, res) => {
    const requestedPageSize = Number.parseInt(String(req.query.pageSize || ''), 10);
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(requestedPageSize, 1), 5000)
      : 5000;
    const contacts = await contactService.list({ ...req.query, page: 1, pageSize });
    const csv = toCsv([
      { key: 'createdAt', label: 'Created At' },
      { key: 'status', label: 'Status' },
      { key: 'brand', label: 'Brand' },
      { key: 'email', label: 'Email' },
      { key: 'packageInterest', label: 'Package' },
      { key: 'message', label: 'Message' },
      { key: 'country', label: 'Country' },
      { key: 'city', label: 'City' },
    ], contacts.items.map((item) => ({
      createdAt: item.createdAt,
      status: item.status,
      brand: item.brand,
      email: item.email,
      packageInterest: item.packageInterest,
      message: item.message,
      country: item.ipMetadata?.country || 'Unknown',
      city: item.ipMetadata?.city || '',
    })));

    await auditService.log('contact.exported', {
      actor: req.adminUser,
      count: contacts.items.length,
    });

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="cuzzycrew-contacts.csv"');
    return res.send(csv);
  }));

  router.get('/contacts/subscribers.csv', asyncHandler(async (req, res) => {
    const search = normalizeText(req.query.q || '', 120).toLowerCase();
    const domainFilter = readSubscriberDomain(req.query.domain);
    const sort = readSubscriberSort(req.query.sort);
    const subscribers = (await context.stores.subscribers.get())
      .map((email) => String(email || '').trim())
      .filter(Boolean)
      .filter((email) => (!search ? true : email.toLowerCase().includes(search)))
      .filter((email) => {
        if (!domainFilter) return true;
        const domain = email.toLowerCase().split('@')[1] || '';
        return domain.includes(domainFilter);
      })
      .sort((left, right) => (sort === 'desc' ? right.localeCompare(left) : left.localeCompare(right)));

    const csv = toCsv([
      { key: 'email', label: 'Subscriber Email' },
    ], subscribers.map((email) => ({ email })));

    await auditService.log('subscriber.exported', {
      actor: req.adminUser,
      count: subscribers.length,
    });

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="cuzzycrew-join-subscribers.csv"');
    return res.send(csv);
  }));

  router.get('/contacts/:id', asyncHandler(async (req, res) => {
    const contact = await contactService.getById(req.params.id);
    if (!contact) {
      return res.status(404).render('admin/error', buildAdminViewModel(siteData, 'Contact Not Found', 'contacts', {
        errorTitle: 'Contact not found',
        errorMessage: 'The request may have been archived or the link is out of date.',
      }));
    }

    const contactName = normalizeText(contact.brand || '', 120) || 'Contact';

    return res.render('admin/contact-detail', buildAdminViewModel(siteData, `${contactName} - Contact`, 'contacts', {
      contact,
      uiMessage: readUiMessage(req.query.msg, DETAIL_MESSAGES),
      returnTo: safeAdminPath(req.query.from, '/admin/contacts'),
    }));
  }));

  router.post('/contacts/:id/update', requireCsrf, asyncHandler(async (req, res) => {
    const updated = await contactService.updateStatus(req.params.id, {
      status: req.body.status,
      tags: normalizeTags(req.body.tags),
      note: req.body.note,
    }, req.adminUser);

    if (!updated) {
      return res.status(404).render('admin/error', buildAdminViewModel(siteData, 'Contact Not Found', 'contacts', {
        errorTitle: 'Contact not found',
        errorMessage: 'The request may have been archived or the link is out of date.',
      }));
    }

    const returnTo = safeAdminPath(req.body.returnTo, `/admin/contacts/${req.params.id}`);
    return res.redirect(appendMessage(returnTo, 'updated'));
  }));

  router.post('/contacts/bulk', requireCsrf, asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body.contactIds)
      ? req.body.contactIds
      : [req.body.contactIds].filter(Boolean);

    const returnTo = safeAdminPath(req.body.returnTo, '/admin/contacts');

    if (!ids.length) {
      return res.redirect(appendMessage(returnTo, 'bulk_empty'));
    }

    await contactService.bulkUpdate(ids, req.body.status, req.adminUser);
    return res.redirect(appendMessage(returnTo, 'bulk_updated'));
  }));

  router.get('/analytics', asyncHandler(async (req, res) => {
    const summary = await analyticsService.getSummary(req.query);
    return res.render('admin/analytics', buildAdminViewModel(siteData, 'Visitor Analytics', 'analytics', {
      summary,
      filters: {
        range: req.query.range || '7d',
        from: req.query.from || '',
        to: req.query.to || '',
      },
    }));
  }));

  router.get('/security', asyncHandler(async (_req, res) => {
    return res.redirect('/admin/analytics');
  }));

  router.get('/api/stats', adminApiLimiter, asyncHandler(async (req, res) => {
    const views = await context.stores.views.get();
    const subscribers = (await context.stores.subscribers.get()).length;
    return res.json({ ok: true, views, subscribers });
  }));

  router.get('/api/analytics/summary', adminApiLimiter, asyncHandler(async (req, res) => {
    const summary = await analyticsService.getSummary(req.query);
    return res.json({ ok: true, summary });
  }));

  return router;
}

module.exports = {
  createAdminRouter,
};
