'use strict';

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { createConfig } = require('./config');
const { createSiteData } = require('./site-data');
const { createStores, initializeStores } = require('./data/stores');
const { AuditService } = require('./services/audit-service');
const { GeoService } = require('./services/geo-service');
const { AnalyticsService } = require('./services/analytics-service');
const { ContactService } = require('./services/contact-service');
const { InstagramService } = require('./services/instagram-service');
const { AuthService } = require('./services/auth-service');
const { createAdminMiddleware } = require('./middleware/admin');
const { createPublicRouter } = require('./routes/public');
const { createAdminRouter } = require('./routes/admin');

async function createApp(options = {}) {
  const config = createConfig(options.env);
  const stores = createStores(config);
  await initializeStores(stores);

  const app = express();
  const siteData = createSiteData(config);

  app.locals.siteData = siteData;
  app.locals.config = config;
  app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        scriptSrc: ['\'self\'', '\'unsafe-inline\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com'],
        fontSrc: ['\'self\'', 'https://fonts.gstatic.com'],
        imgSrc: ['\'self\'', 'data:'],
        connectSrc: ['\'self\''],
        frameSrc: ['\'none\''],
        objectSrc: ['\'none\''],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(morgan(config.isTest ? 'tiny' : 'dev'));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '20kb' }));
  app.use(express.static(path.join(process.cwd(), 'public'), {
    maxAge: '7d',
    etag: true,
  }));

  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'views'));

  const auditService = new AuditService(stores.audit, config.auditEventLimit);
  const geoService = new GeoService({
    store: stores.geoCache,
    secret: config.sessionSecret,
    limit: config.geoCacheLimit,
    trustProxy: config.trustProxy,
  });
  const analyticsService = new AnalyticsService({
    store: stores.analytics,
    geoService,
    secret: config.visitorSalt,
    eventLimit: config.analyticsEventLimit,
  });
  const instagramService = new InstagramService({
    disableExternalFetch: config.disableExternalFetch || options.disableExternalFetch,
    fallbackCount: config.instagramFollowersFallback,
  });
  const authService = new AuthService({
    store: stores.auth,
    auditService,
    config,
  });
  const contactService = new ContactService({
    store: stores.contacts,
    auditService,
    secret: config.sessionSecret,
  });

  const services = {
    analyticsService,
    auditService,
    authService,
    contactService,
    geoService,
    instagramService,
  };
  const middleware = createAdminMiddleware(services, config);
  const context = {
    config,
    middleware,
    services,
    siteData,
    stores,
  };

  app.use(createPublicRouter(context));
  app.use('/admin', createAdminRouter(context));

  app.use((req, res) => {
    res.status(404).render('404', { ...siteData });
  });

  app.use((err, req, res, _next) => {
    const isJsonSyntax = err instanceof SyntaxError && 'body' in err;
    if (isJsonSyntax) {
      if (req.path.startsWith('/admin/')) {
        return res.status(400).json({
          ok: false,
          error: 'Malformed JSON payload.',
          code: 'invalid_json',
        });
      }

      return res.status(400).json({
        ok: false,
        error: 'Malformed request payload.',
      });
    }

    console.error('[Error]', err);
    if (req.path.startsWith('/admin/api/')) {
      return res.status(500).json({
        ok: false,
        error: 'Internal server error.',
        code: 'internal_error',
      });
    }

    return res.status(500).render('500', { ...siteData });
  });

  return {
    app,
    config,
    services,
    stores,
  };
}

module.exports = {
  createApp,
};
