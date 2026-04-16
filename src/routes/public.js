'use strict';

const express = require('express');
const { validateContactPayload, validateJoinPayload } = require('../utils/validation');
const { getUserAgent, getClientIp } = require('../utils/request');
const { hashValue } = require('../utils/crypto');

function createPublicRouter(context) {
  const router = express.Router();
  const {
    siteData,
    services,
    stores,
  } = context;
  const {
    analyticsService,
    contactService,
    instagramService,
  } = services;

  router.get('/', async (req, res, next) => {
    try {
      await analyticsService.track(req, 'page_view', { source: 'homepage' });
      const igFollowers = await instagramService.getDisplayCount();
      res.render('index', { ...siteData, igFollowers });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/views/:section', async (req, res, next) => {
    try {
      const section = req.params.section.replace(/[^a-z0-9-_]/gi, '').slice(0, 60);
      if (!section) return res.status(400).json({ ok: false });

      const views = await stores.views.update((state) => {
        state[section] = (state[section] || 0) + 1;
        return state;
      });

      await analyticsService.track(req, 'section_view', { section });
      res.json({ ok: true, section, count: views[section] });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/stats', (_req, res) => {
    res.status(403).json({
      ok: false,
      error: 'This endpoint is no longer public. Use the protected admin analytics endpoints instead.',
    });
  });

  router.post('/join', async (req, res, next) => {
    try {
      const validation = validateJoinPayload(req.body || {});
      if (!validation.ok) {
        return res.status(400).json({ ok: false, error: validation.error });
      }

      let already = false;
      await stores.subscribers.update((state) => {
        already = state.includes(validation.value.email);
        if (!already) state.push(validation.value.email);
        return state;
      });

      if (!already) {
        await analyticsService.track(req, 'join', { source: 'hero_join_form' });
      }

      res.json({ ok: true, already });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/followers', async (req, res, next) => {
    try {
      const followerData = await instagramService.getFollowerData();
      res.json(followerData);
    } catch (error) {
      next(error);
    }
  });

  router.post('/contact', async (req, res, next) => {
    try {
      const validation = validateContactPayload(req.body || {});
      const igFollowers = await instagramService.getDisplayCount();

      if (!validation.ok) {
        return res.status(400).render('index', {
          ...siteData,
          igFollowers,
          formError: validation.error,
          formScrollTo: true,
        });
      }

      const location = await services.geoService.resolve(req);
      await contactService.createFromPublic(validation.value, {
        ipMetadata: {
          ipHash: hashValue(getClientIp(req), context.config.sessionSecret),
          ipClass: location.ipClass,
          country: location.country,
          region: location.region,
          city: location.city,
          source: location.source,
        },
        userAgent: getUserAgent(req),
      });
      await analyticsService.track(req, 'contact', { source: 'contact_form' });

      return res.render('index', {
        ...siteData,
        igFollowers,
        formSuccess: true,
        formScrollTo: true,
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = {
  createPublicRouter,
};
