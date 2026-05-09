'use strict';
const fetch = require('node-fetch');

fetch('https://www.instagram.com/sharikh_naveed/', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    Accept: 'text/html',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  signal: AbortSignal.timeout(10000),
})
  .then(r => r.text())
  .then(html => {
    const m1 = html.match(/"edge_followed_by":\{"count":(\d+)/);
    const m2 = html.match(/og:description[^>]*>([\d,.]+[KM]?) Followers/i);
    const m3 = html.match(/"follower_count":(\d+)/);
    console.log('edge_followed_by:', m1 && m1[1]);
    console.log('og:description:', m2 && m2[1]);
    console.log('follower_count:', m3 && m3[1]);
    if (!m1 && !m2 && !m3) {
      console.log('No count found. HTML snippet:\n', html.slice(0, 500));
    }
  })
  .catch(e => console.error(e.message));
