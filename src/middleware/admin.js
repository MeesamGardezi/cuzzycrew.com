'use strict';

function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

function createRateLimiter(options) {
  const entries = new Map();

  return async function rateLimit(req, res, next) {
    const now = Date.now();
    const key = options.keyBuilder(req);
    const windowMs = options.windowMs;
    const existing = entries.get(key);
    const entry = existing && now - existing.startedAt < windowMs
      ? existing
      : { count: 0, startedAt: now };

    if (!existing || entry !== existing) {
      const cleanup = setTimeout(() => {
        const current = entries.get(key);
        if (current === entry) {
          entries.delete(key);
        }
      }, windowMs + 1000);

      if (typeof cleanup.unref === 'function') {
        cleanup.unref();
      }
    }

    entry.count += 1;
    entries.set(key, entry);

    if (entry.count <= options.max) return next();

    if (options.onLimit) {
      await options.onLimit(req);
    }

    res.status(429);
    if (options.json) {
      return res.json({
        ok: false,
        error: 'Too many requests. Please slow down and try again shortly.',
        code: 'rate_limited',
      });
    }

    return res.render('admin/login', {
      ...req.app.locals.siteData,
      pageTitle: 'Admin Login',
      activePage: 'login',
      loginError: 'Too many requests. Please wait and try again.',
      csrfToken: '',
      devDefaults: req.app.locals.config?.isProduction ? null : {
        username: req.app.locals.config?.adminUsername,
        password: req.app.locals.config?.adminPassword,
      },
    });
  };
}

function wantsJson(req) {
  return req.originalUrl.startsWith('/admin/api/') || req.get('x-requested-with') === 'XMLHttpRequest' || req.accepts(['html', 'json']) === 'json';
}

function createAdminMiddleware(services, config) {
  const { authService, auditService } = services;

  const attachSession = asyncHandler(async (req, res, next) => {
    const session = await authService.getSession(req);
    req.adminSession = session;
    req.adminUser = session?.username || '';
    res.locals.adminSession = session;
    res.locals.adminUser = session?.username || '';
    res.locals.csrfToken = session?.csrfToken || '';
    next();
  });

  const requireAdmin = asyncHandler(async (req, res, next) => {
    const session = req.adminSession || await authService.getSession(req);
    if (session) {
      req.adminSession = session;
      req.adminUser = session.username;
      res.locals.adminSession = session;
      res.locals.adminUser = session.username;
      res.locals.csrfToken = session.csrfToken;
      return next();
    }

    await auditService.log('auth.unauthorized_access', {
      actor: 'anonymous',
      path: req.originalUrl,
      method: req.method,
    });

    if (wantsJson(req)) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required.',
        code: 'auth_required',
      });
    }

    return res.redirect('/admin/login');
  });

  const requireCsrf = asyncHandler(async (req, res, next) => {
    if (!req.adminSession || authService.validateCsrf(req, req.adminSession)) {
      return next();
    }

    await auditService.log('auth.invalid_csrf', {
      actor: req.adminUser || 'anonymous',
      path: req.originalUrl,
      method: req.method,
    });

    if (wantsJson(req)) {
      return res.status(403).json({
        ok: false,
        error: 'Your session could not be verified. Refresh and try again.',
        code: 'invalid_csrf',
      });
    }

    res.status(403);
    return res.render('admin/error', {
      ...req.app.locals.siteData,
      pageTitle: 'Session Verification Failed',
      activePage: 'security',
      errorTitle: 'Session verification failed',
      errorMessage: 'Refresh the page and try again.',
    });
  });

  const loginLimiter = createRateLimiter({
    windowMs: config.loginWindowMinutes * 60 * 1000,
    max: config.loginMaxAttempts + 2,
    keyBuilder: (req) => `${req.ip}:login`,
    onLimit: (req) => auditService.log('auth.login_rate_limited', {
      actor: 'anonymous',
      path: req.originalUrl,
    }),
  });

  const adminPageLimiter = createRateLimiter({
    windowMs: config.adminPageWindowMinutes * 60 * 1000,
    max: config.adminPageMaxRequests,
    keyBuilder: (req) => `${req.adminUser || req.ip}:page`,
    onLimit: (req) => auditService.log('admin.page_rate_limited', {
      actor: req.adminUser || 'anonymous',
      path: req.originalUrl,
    }),
  });

  const adminApiLimiter = createRateLimiter({
    windowMs: config.adminApiWindowMinutes * 60 * 1000,
    max: config.adminApiMaxRequests,
    keyBuilder: (req) => `${req.adminUser || req.ip}:api`,
    onLimit: (req) => auditService.log('admin.api_rate_limited', {
      actor: req.adminUser || 'anonymous',
      path: req.originalUrl,
    }),
    json: true,
  });

  return {
    adminApiLimiter,
    adminPageLimiter,
    asyncHandler,
    attachSession,
    loginLimiter,
    noStore,
    requireAdmin,
    requireCsrf,
  };
}

module.exports = {
  createAdminMiddleware,
  noStore,
};
