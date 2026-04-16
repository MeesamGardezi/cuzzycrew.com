'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createApp } = require('../src/app');

class CookieJar {
  constructor() {
    this.cookies = [];
  }

  update(response) {
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const header of setCookies) {
      const [pair, ...attributes] = header.split(';');
      const [name, value] = pair.split('=');
      const pathAttr = attributes.find((attribute) => attribute.trim().toLowerCase().startsWith('path='));
      const cookiePath = pathAttr ? pathAttr.split('=')[1].trim() : '/';
      this.cookies = this.cookies.filter((cookie) => cookie.name !== name.trim());
      if (value) {
        this.cookies.push({
          name: name.trim(),
          value: value.trim(),
          path: cookiePath,
        });
      }
    }
  }

  headerFor(pathname) {
    return this.cookies
      .filter((cookie) => pathname.startsWith(cookie.path))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }
}

async function createTestServer(env = {}) {
  const dataDir = env.DATA_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'cuzzycrew-test-'));
  const context = await createApp({
    env: {
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      DISABLE_EXTERNAL_FETCH: '1',
      TRUST_PROXY: env.TRUST_PROXY || '0',
      ADMIN_USERNAME: env.ADMIN_USERNAME || 'admin',
      ADMIN_PASSWORD: env.ADMIN_PASSWORD || 'cuzzycrew-local-only',
      ...env,
    },
  });

  const server = http.createServer(context.app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    ...context,
    baseUrl,
    dataDir,
    server,
    async cleanup() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function request(serverContext, pathname, options = {}) {
  const jar = options.jar;
  const headers = new Headers(options.headers || {});
  if (jar) {
    const cookieHeader = jar.headerFor(pathname);
    if (cookieHeader) headers.set('cookie', cookieHeader);
  }

  const response = await fetch(`${serverContext.baseUrl}${pathname}`, {
    method: options.method || 'GET',
    redirect: options.redirect || 'follow',
    headers,
    body: options.body,
  });

  if (jar) jar.update(response);
  return response;
}

async function login(serverContext, jar) {
  const response = await request(serverContext, '/admin/login', {
    method: 'POST',
    redirect: 'manual',
    jar,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      username: 'admin',
      password: 'cuzzycrew-local-only',
    }),
  });

  assert.equal(response.status, 302);
  return response;
}

function extractCsrfToken(html) {
  const match = String(html).match(/name="_csrf"\s+value="([^"]+)"/);
  assert.ok(match, 'expected csrf token to be present');
  return match[1];
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

module.exports = {
  CookieJar,
  createTestServer,
  extractCsrfToken,
  login,
  readJson,
  request,
};
