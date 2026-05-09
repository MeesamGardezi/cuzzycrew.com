'use strict';

function createSiteData(config) {
  return {
    meta: {
      title: 'Sharikh Naveed · CuzzyCrew',
      description: 'Creator from Sialkot. Accent comedy, lifestyle, and street culture. 86K+ followers.',
      url: config.siteUrl,
    },
    creator: {
      name: 'Sharikh Naveed',
      handle: '@sharikh_naveed',
      igUrl: 'https://www.instagram.com/sharikh_naveed/',
      tagline: 'Sharikh Naveed · CuzzyCrew',
      bio: [
        'I grew up in Sialkot absorbing two worlds at once — the rhythm of Italian cinema running on pirated DVDs and the raw energy of New York street culture coming through a dial-up connection. That collision never left me.',
        'I started making videos because no one around me sounded quite like me. The accent — part Lahore, part Brooklyn, part Fellini — turned out to be the whole point. What began as a bit became a voice, and the voice became a community.',
      ],
      quote: '"I don\'t make content. I make people feel like they\'re with the crew."',
      stats: [
        { value: '500K', label: 'Total Reach' },
        { value: '8.4%', label: 'Engagement Rate' },
        { value: '40+', label: 'Countries' },
        { value: '200+', label: 'Reels Published' },
      ],
      miniStats: [
        { value: 'Sialkot', label: 'Origin' },
        { value: '2023', label: 'Active Since' },
        { value: '40+', label: 'Countries Reached' },
        { value: '200+', label: 'Videos Made' },
      ],
    },
    niches: [
      { num: 'I', title: 'Accent Comedy', desc: 'The bit that started everything. Italian-NY-Sialkoti all at once. It sounds wrong until it sounds exactly right.' },
      { num: 'II', title: 'Street & Food', desc: 'Lahore to wherever. What I eat, where I go, what catches my eye. Unscripted.' },
      { num: 'III', title: 'Everyday Life', desc: 'The mundane stuff that isn\'t actually mundane. Observations, moments, things that shouldn\'t be funny but are.' },
      { num: 'IV', title: 'Short-Form', desc: 'Reels, Shorts, TikToks. Fast, sharp, done. The format I think in.' },
      { num: 'V', title: 'Creator Collabs', desc: 'When the chemistry is real you can feel it. I only link with people I\'d actually hang with.' },
    ],
    platforms: [
      {
        name: 'Instagram',
        reachPct: 68,
        engLabel: 'Engagement',
        engVal: '8.4%',
        engPct: 84,
        desc: 'My primary platform. Reels, Stories, and collabs. This is where my community is most active.',
      },
      {
        name: 'TikTok',
        reachPct: 45,
        engLabel: 'Engagement',
        engVal: '6.1%',
        engPct: 61,
        desc: 'Growing fast. My accent content hits differently here. I cross-post for wider reach.',
      },
      {
        name: 'YouTube',
        reachPct: 22,
        engLabel: 'Watch Retention',
        engVal: '74%',
        engPct: 74,
        desc: 'Shorts and long-form. I use it for deeper content where I can actually tell a story.',
      },
    ],
    shopUrl: config.shopUrl,
    year: new Date().getFullYear(),
  };
}

module.exports = {
  createSiteData,
};
