'use strict';

const { hashValue, randomToken, safeCompare, signValue } = require('../utils/crypto');
const { parseCookies, getClientIp, getUserAgent } = require('../utils/request');
const { addMinutes, nowIso } = require('../utils/time');

class AuthService {
  constructor(options) {
    this.store = options.store;
    this.auditService = options.auditService;
    this.config = options.config;
  }

  getCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'Lax',
      secure: this.config.isProduction,
      path: '/admin',
    };
  }

  serializeCookie(name, value, options) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    parts.push(`Path=${options.path || '/'}`);
    if (options.httpOnly) parts.push('HttpOnly');
    if (options.secure) parts.push('Secure');
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
    return parts.join('; ');
  }

  clearCookie(res) {
    res.setHeader('Set-Cookie', this.serializeCookie(this.config.adminCookieName, '', {
      ...this.getCookieOptions(),
      maxAge: 0,
    }));
  }

  buildSessionCookie(sessionId) {
    return `${sessionId}.${signValue(sessionId, this.config.sessionSecret)}`;
  }

  parseSessionCookie(req) {
    const cookies = parseCookies(req);
    const cookie = cookies[this.config.adminCookieName];
    if (!cookie) return null;
    const [sessionId, signature] = cookie.split('.');
    if (!sessionId || !signature) return null;
    const expected = signValue(sessionId, this.config.sessionSecret);
    if (!safeCompare(signature, expected)) return null;
    return sessionId;
  }

  buildAttemptKey(req, username) {
    return hashValue(`${getClientIp(req)}|${String(username || '').toLowerCase()}`, this.config.sessionSecret);
  }

  async registerFailedAttempt(req, username) {
    const key = this.buildAttemptKey(req, username);
    const now = new Date();
    const lockUntil = addMinutes(now, this.config.loginLockMinutes).toISOString();

    await this.store.update((state) => {
      const entry = state.login.attempts[key] || {
        count: 0,
        firstAttemptAt: now.toISOString(),
        lockUntil: '',
      };

      const firstAttemptAt = new Date(entry.firstAttemptAt);
      if (now.getTime() - firstAttemptAt.getTime() > (this.config.loginWindowMinutes * 60 * 1000)) {
        entry.count = 0;
        entry.firstAttemptAt = now.toISOString();
      }

      entry.count += 1;
      if (entry.count >= this.config.loginMaxAttempts) {
        entry.lockUntil = lockUntil;
      }

      state.login.attempts[key] = entry;
      return state;
    });

    await this.auditService.log('auth.failed_login', {
      actor: 'anonymous',
      ipHash: hashValue(getClientIp(req), this.config.sessionSecret),
    });
  }

  async clearAttempts(req, username) {
    const key = this.buildAttemptKey(req, username);
    await this.store.update((state) => {
      delete state.login.attempts[key];
      return state;
    });
  }

  async getLockStatus(req, username) {
    const state = await this.store.get();
    const key = this.buildAttemptKey(req, username);
    const entry = state.login.attempts[key];
    if (!entry || !entry.lockUntil) return { locked: false };
    const lockedUntil = new Date(entry.lockUntil);
    if (lockedUntil <= new Date()) return { locked: false };
    return { locked: true, lockedUntil: entry.lockUntil };
  }

  async authenticate(req, username, password) {
    const lockStatus = await this.getLockStatus(req, username);
    if (lockStatus.locked) {
      await this.auditService.log('auth.locked_out', {
        actor: 'anonymous',
        ipHash: hashValue(getClientIp(req), this.config.sessionSecret),
        lockedUntil: lockStatus.lockedUntil,
      });
      return { ok: false, locked: true };
    }

    const validUsername = safeCompare(username, this.config.adminUsername);
    const validPassword = safeCompare(password, this.config.adminPassword);
    if (!validUsername || !validPassword) {
      await this.registerFailedAttempt(req, username);
      return { ok: false, locked: false };
    }

    await this.clearAttempts(req, username);
    const sessionId = randomToken(24);
    const sessionHash = hashValue(sessionId, this.config.sessionSecret);
    const createdAt = nowIso();
    const csrfToken = randomToken(24);

    await this.store.update((state) => {
      state.sessions[sessionHash] = {
        username: this.config.adminUsername,
        createdAt,
        lastSeenAt: createdAt,
        csrfToken,
        userAgent: getUserAgent(req),
        ipHash: hashValue(getClientIp(req), this.config.sessionSecret),
      };
      return state;
    });

    await this.auditService.log('auth.login_success', {
      actor: this.config.adminUsername,
      ipHash: hashValue(getClientIp(req), this.config.sessionSecret),
    });

    return {
      ok: true,
      sessionId,
      sessionHash,
      csrfToken,
    };
  }

  async createSession(res, sessionId) {
    res.setHeader('Set-Cookie', this.serializeCookie(
      this.config.adminCookieName,
      this.buildSessionCookie(sessionId),
      this.getCookieOptions(),
    ));
  }

  async destroySession(req, res, reason = 'logout') {
    const sessionId = this.parseSessionCookie(req);
    if (sessionId) {
      const sessionHash = hashValue(sessionId, this.config.sessionSecret);
      await this.store.update((state) => {
        delete state.sessions[sessionHash];
        return state;
      });
      await this.auditService.log('auth.logout', { actor: req.adminUser || 'anonymous', reason });
    }

    this.clearCookie(res);
  }

  async getSession(req) {
    const sessionId = this.parseSessionCookie(req);
    if (!sessionId) return null;

    const sessionHash = hashValue(sessionId, this.config.sessionSecret);
    const state = await this.store.get();
    const session = state.sessions[sessionHash];
    if (!session) return null;

    const now = new Date();
    const createdAt = new Date(session.createdAt);
    const lastSeenAt = new Date(session.lastSeenAt);
    const idleExpired = now.getTime() - lastSeenAt.getTime() > (this.config.sessionIdleMinutes * 60 * 1000);
    const absoluteExpired = now.getTime() - createdAt.getTime() > (this.config.sessionAbsoluteMinutes * 60 * 1000);

    if (idleExpired || absoluteExpired) {
      await this.store.update((data) => {
        delete data.sessions[sessionHash];
        return data;
      });
      await this.auditService.log('auth.session_expired', {
        actor: session.username,
        reason: idleExpired ? 'idle_timeout' : 'absolute_timeout',
      });
      return null;
    }

    await this.store.update((data) => {
      if (data.sessions[sessionHash]) {
        data.sessions[sessionHash].lastSeenAt = now.toISOString();
      }
      return data;
    });

    return {
      ...session,
      sessionHash,
    };
  }

  validateCsrf(req, session) {
    const token = req.body?._csrf || req.get('x-csrf-token');
    return Boolean(token) && safeCompare(token, session.csrfToken);
  }
}

module.exports = {
  AuthService,
};
