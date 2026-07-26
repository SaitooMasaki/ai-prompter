const path = require('path');
const puppeteer = require('C:/Users/kam1n/side-projects/tonshift/node_modules/puppeteer');

const files = [
  { name: '01-hero', width: 1280, height: 800 },
  { name: '02-popup', width: 1280, height: 800 },
  { name: '03-edit', width: 1280, height: 800 },
  { name: '04-multisite', width: 1280, height: 800 },
  { name: '05-promo-small', width: 440, height: 280 },
  { name: '06-marquee', width: 1400, height: 560 },
];

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  for (const { name, width, height } of files) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const filePath = path.join(__dirname, `${name}.html`);
    await page.goto('file:///' + filePath.replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.screenshot({ path: path.join(__dirname, `${name}.png`), clip: { x: 0, y: 0, width, height } });
    console.log('rendered', name);
  }

  await browser.close();
})();
