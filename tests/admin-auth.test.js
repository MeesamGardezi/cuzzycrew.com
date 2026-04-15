'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CookieJar,
  createTestServer,
  extractCsrfToken,
  login,
  request,
} = require('./helpers');

test('admin auth success, failure, lockout, logout, and session expiry', async () => {
  const lockoutServer = await createTestServer();

  try {
    let response = await request(lockoutServer, '/admin/login');
    assert.equal(response.status, 200);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      response = await request(lockoutServer, '/admin/login', {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username: 'admin',
          password: 'wrong-password',
        }),
      });
      assert.equal(response.status, 401);
    }

    response = await request(lockoutServer, '/admin/login', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: 'admin',
        password: 'wrong-password',
      }),
    });
    assert.equal(response.status, 429);
  } finally {
    await lockoutServer.cleanup();
  }

  const server = await createTestServer();
  const jar = new CookieJar();

  try {
    await login(server, jar);

    let response = await request(server, '/admin', { jar });
    assert.equal(response.status, 200);
    const dashboardHtml = await response.text();
    const csrfToken = extractCsrfToken(dashboardHtml);

    response = await request(server, '/admin/logout', {
      method: 'POST',
      redirect: 'manual',
      jar,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ _csrf: csrfToken }),
    });
    assert.equal(response.status, 302);

    response = await request(server, '/admin', { jar, redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/login');

    await login(server, jar);
    const authState = await server.stores.auth.get();
    const sessionKey = Object.keys(authState.sessions)[0];
    await server.stores.auth.update((state) => {
      state.sessions[sessionKey].createdAt = '2000-01-01T00:00:00.000Z';
      state.sessions[sessionKey].lastSeenAt = '2000-01-01T00:00:00.000Z';
      return state;
    });

    response = await request(server, '/admin', { jar, redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/login');
  } finally {
    await server.cleanup();
  }
});

test('admin route guard covers protected pages and apis', async () => {
  const server = await createTestServer();

  try {
    const pagePaths = ['/admin', '/admin/contacts', '/admin/analytics', '/admin/security'];
    for (const pathname of pagePaths) {
      const response = await request(server, pathname, { redirect: 'manual' });
      assert.equal(response.status, 302, pathname);
      assert.equal(response.headers.get('location'), '/admin/login');
    }

    const apiPaths = ['/admin/api/analytics/summary', '/admin/api/stats'];
    for (const pathname of apiPaths) {
      const response = await request(server, pathname);
      assert.equal(response.status, 401, pathname);
      const body = await response.json();
      assert.equal(body.code, 'auth_required');
    }
  } finally {
    await server.cleanup();
  }
});

test('csrf is enforced on mutating admin routes', async () => {
  const server = await createTestServer();
  const jar = new CookieJar();

  try {
    await login(server, jar);
    const response = await request(server, '/admin/contacts/bulk', {
      method: 'POST',
      jar,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        status: 'archived',
        contactIds: 'missing',
      }),
    });

    assert.equal(response.status, 403);
  } finally {
    await server.cleanup();
  }
});
