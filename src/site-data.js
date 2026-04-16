'use strict';

function createSiteData(config) {
  return {
    meta: {
      title: 'Sharikh Naveed · CuzzyCrew',
      description: 'Pakistani creator. Accent comedy, lifestyle, and street culture. 86K+ followers.',
      url: config.siteUrl,
    },
    creator: {
      name: 'Sharikh Naveed',
      handle: '@sharikh_naveed',
      igUrl: 'https://www.instagram.com/sharikh_naveed/',
      tagline: 'Sharikh Naveed · CuzzyCrew',
      bio: [
        'Born in Pakistan. Grew up on Italian cinema and New York culture. Sharikh makes accent comedy, lifestyle, and street content that\'s hard to put in a box.',
        '86K+ followers, real engagement, 40+ countries. Brands get an organic placement, not a banner ad.',
      ],
      quote: '"I don\'t make content. I make people feel like they\'re with the crew."',
      stats: [
        { value: '500K', label: 'Total Reach' },
        { value: '8.4%', label: 'Engagement Rate' },
        { value: '40+', label: 'Countries' },
        { value: '200+', label: 'Reels Published' },
      ],
      miniStats: [
        { value: 'PKR 180K', label: 'Top Deal Value' },
        { value: '2023', label: 'Active Since' },
        { value: '3', label: 'Platforms' },
        { value: '100%', label: 'Authentic' },
      ],
    },
    niches: [
      { num: 'I', title: 'Accent Comedy', desc: 'The signature. Italian-NY-Pakistani fusion, unmistakably Sharikh. Every video built around the bit.' },
      { num: 'II', title: 'Lifestyle', desc: 'Street culture, food, fashion, everyday moments. Shot clean, edited sharp, kept real.' },
      { num: 'III', title: 'Brand Integration', desc: 'Products work when they fit the story. Organic placements, not forced reads. The audience notices the difference.' },
      { num: 'IV', title: 'Reels & Shorts', desc: '200+ short-form videos. Strong hooks, high retention, consistent posting cadence.' },
      { num: 'V', title: 'Story Campaigns', desc: 'Multi-frame story series with real click-through. Built around narrative, not just product shots.' },
      { num: 'VI', title: 'Full Campaigns', desc: 'Strategy, scripting, filming, delivery, and reporting. End to end.' },
    ],
    platforms: [
      {
        name: 'Instagram',
        reachPct: 68,
        engLabel: 'Engagement',
        engVal: '8.4%',
        engPct: 84,
        desc: 'Primary platform. Reels, Stories, and collabs. Highest engagement and conversion.',
      },
      {
        name: 'TikTok',
        reachPct: 45,
        engLabel: 'Engagement',
        engVal: '6.1%',
        engPct: 61,
        desc: 'Growing. Accent content works well here. Cross-posted for wider reach.',
      },
      {
        name: 'YouTube',
        reachPct: 22,
        engLabel: 'Watch Retention',
        engVal: '74%',
        engPct: 74,
        desc: 'Shorts and long-form. Good watch retention. Better for in-depth content.',
      },
    ],
    shopUrl: config.shopUrl,
    year: new Date().getFullYear(),
  };
}

module.exports = {
  createSiteData,
};
