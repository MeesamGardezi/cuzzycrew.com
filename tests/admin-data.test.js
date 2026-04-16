'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  CookieJar,
  createTestServer,
  extractCsrfToken,
  login,
  readJson,
  request,
} = require('./helpers');

test('contact submissions persist and workflow transitions are saved', async () => {
  const server = await createTestServer({
    TRUST_PROXY: '1',
  });
  const jar = new CookieJar();

  try {
    let response = await request(server, '/contact', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': '203.0.113.10',
        'x-vercel-ip-country': 'PK',
        'x-vercel-ip-country-region': 'Sindh',
        'x-vercel-ip-city': 'Karachi',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      },
      body: new URLSearchParams({
        brand: 'Test Brand',
        email: 'hello@testbrand.com',
        package: 'Custom',
        message: 'We want a campaign around a new product launch next month.',
      }),
    });

    assert.equal(response.status, 200);
    const contactsState = await readJson(path.join(server.dataDir, 'contacts.json'));
    assert.equal(contactsState.items.length, 1);
    assert.equal(contactsState.items[0].brand, 'Test Brand');
    assert.equal(contactsState.items[0].ipMetadata.country, 'PK');

    await login(server, jar);
    response = await request(server, '/admin', { jar });
    const html = await response.text();
    const csrfToken = extractCsrfToken(html);
    const contactId = contactsState.items[0].id;

    response = await request(server, `/admin/contacts/${contactId}/update`, {
      method: 'POST',
      redirect: 'manual',
      jar,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        _csrf: csrfToken,
        status: 'contacted',
        tags: 'vip, launch',
        note: 'Confirmed brief call for Friday morning.',
      }),
    });

    assert.equal(response.status, 302);
    const updatedState = await readJson(path.join(server.dataDir, 'contacts.json'));
    assert.equal(updatedState.items[0].status, 'contacted');
    assert.deepEqual(updatedState.items[0].tags, ['vip', 'launch']);
    assert.equal(updatedState.items[0].notes.length, 1);
  } finally {
    await server.cleanup();
  }
});

test('analytics aggregation and geo fallback behave as expected', async () => {
  const server = await createTestServer({
    TRUST_PROXY: '1',
  });
  const jar = new CookieJar();

  try {
    await request(server, '/', {
      headers: {
        'x-forwarded-for': '198.51.100.10',
        'x-vercel-ip-country': 'PK',
        'x-vercel-ip-country-region': 'Punjab',
        'x-vercel-ip-city': 'Lahore',
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      },
    });

    await request(server, '/api/views/bio', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '198.51.100.10',
        'x-vercel-ip-country': 'PK',
        'x-vercel-ip-country-region': 'Punjab',
        'x-vercel-ip-city': 'Lahore',
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      },
    });

    await request(server, '/join', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.10',
        'x-vercel-ip-country': 'PK',
        'x-vercel-ip-country-region': 'Punjab',
        'x-vercel-ip-city': 'Lahore',
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      },
      body: JSON.stringify({ email: 'subscriber@example.com' }),
    });

    await request(server, '/contact', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': '198.51.100.10',
        'x-vercel-ip-country': 'PK',
        'x-vercel-ip-country-region': 'Punjab',
        'x-vercel-ip-city': 'Lahore',
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      },
      body: new URLSearchParams({
        brand: 'Analytics Brand',
        email: 'analytics@test.com',
        package: 'Custom',
        message: 'Need a conversion-focused campaign for a nationwide launch.',
      }),
    });

    await request(server, '/', {
      headers: {
        'user-agent': 'Mozilla/5.0',
      },
    });

    await login(server, jar);
    const response = await request(server, '/admin/api/analytics/summary?range=30d', { jar });
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.summary.kpis.totalVisits, 2);
    assert.equal(payload.summary.kpis.uniqueVisitors, 2);
    assert.equal(payload.summary.kpis.joinConversions, 1);
    assert.equal(payload.summary.kpis.contactConversions, 1);
    assert.equal(payload.summary.topCountries[0].label, 'PK');
    assert.equal(payload.summary.sectionPerformance[0].label, 'bio');
    assert.equal(payload.summary.deviceSummary[0].label, 'mobile');

    const contactsPage = await request(server, '/admin/contacts', { jar });
    assert.equal(contactsPage.status, 200);
    const contactsHtml = await contactsPage.text();
    assert.match(contactsHtml, /Join CuzzyCrew Subscribers/);
    assert.match(contactsHtml, /subscriber@example\.com/);

    const subscribersExport = await request(server, '/admin/contacts/subscribers.csv', { jar });
    assert.equal(subscribersExport.status, 200);
    assert.ok((subscribersExport.headers.get('content-type') || '').includes('text/csv'));
    const subscribersCsv = await subscribersExport.text();
    assert.match(subscribersCsv, /Subscriber Email/);
    assert.match(subscribersCsv, /subscriber@example\.com/);

    const analyticsState = await readJson(path.join(server.dataDir, 'analytics.json'));
    const localEvent = analyticsState.events.find((event) => event.country === 'Unknown');
    assert.equal(localEvent.ipClass, 'private');
  } finally {
    await server.cleanup();
  }
});

test('json corruption recovery and queued writes keep stores valid', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tmp-cuzzy-test-'));

  try {
    await fs.writeFile(path.join(tempDir, 'contacts.json'), '{broken json');
    const server = await createTestServer({
      DATA_DIR: tempDir,
    });

    try {
      const contactsState = await readJson(path.join(tempDir, 'contacts.json'));
      assert.deepEqual(contactsState.items, []);

      const files = await fs.readdir(tempDir);
      assert.ok(files.some((file) => file.startsWith('contacts.json.') && file.endsWith('.broken')));

      await Promise.all(Array.from({ length: 25 }, (_, index) => server.stores.views.update((state) => {
        state[`section-${index}`] = index;
        return state;
      })));

      const viewsState = await readJson(path.join(tempDir, 'views.json'));
      assert.equal(Object.keys(viewsState).length, 25);
    } finally {
      await server.cleanup();
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
