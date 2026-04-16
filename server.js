'use strict';

const { createApp } = require('./src/app');

async function start() {
  const { app, config, services } = await createApp();

  app.listen(config.port, () => {
    console.log(`\n  CuzzyCrew running → http://localhost:${config.port}\n`);
    services.instagramService.fetchFollowers()
      .then((count) => {
        if (count != null) {
          console.log(`  [IG] cached followers: ${count}`);
        }
      })
      .catch(() => {});
  });
}

start().catch((error) => {
  console.error('[Startup Error]', error);
  process.exit(1);
});
