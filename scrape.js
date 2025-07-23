#!/usr/bin/env node
const fs = require('fs-extra');
const path = require('path');
const { program } = require('commander');
const { parse } = require('csv-parse/sync');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const PuppeteerHar = require('puppeteer-har');
const PQueue = require('p-queue').default;

// Stealth plugin
puppeteer.use(StealthPlugin());

program
  .option('-i, --input <path>', 'CSV file with columns [harFilename,url]', 'urls')
  .option('-o, --outdir <dir>', 'Output directory for .har files', './hars')
  .option('-c, --concurrency <n>', 'Parallel pages', parseInt, 2)
  .option('--headless', 'Run in headless mode', false)
  .option('--idle-timeout <ms>', 'Quiet time before stopping HAR (ms)', parseInt, 2000)
  .option('--max-timeout <ms>', 'Max wait for network idle (ms)', parseInt, 15000)
  .option('--wait-until <event>', 'Puppeteer waitUntil (load, domcontentloaded, networkidle0, networkidle2)', 'domcontentloaded')
  .parse(process.argv);

(async () => {
  const opts = program.opts();
  await fs.ensureDir(opts.outdir);

  // Read & parse CSV
  const raw = await fs.readFile(opts.input, 'utf8');
  const records = parse(raw, { columns: false, skip_empty_lines: true });
  if (!records.length) {
    console.error('No lines found in CSV.');
    process.exit(1);
  }

  // Launch browser
  const browser = await puppeteer.launch({ headless: opts.headless });
  const queue = new PQueue({ concurrency: opts.concurrency });

  // Helper: wait for network to idle (or bail at max timeout)
  function waitForNetworkIdle(page, idleMs = opts.idleTimeout, maxMs = opts.maxTimeout) {
    return new Promise((resolve) => {
      let inflight = 0, idleTimer, maxTimer;

      const onRequest = () => {
        inflight++;
        clearTimeout(idleTimer);
      };
      const onFinished = () => {
        inflight = Math.max(inflight - 1, 0);
        if (inflight === 0) {
          idleTimer = setTimeout(() => {
            cleanup();
            resolve();
          }, idleMs);
        }
      };
      const cleanup = () => {
        page.off('request', onRequest);
        page.off('requestfinished', onFinished);
        page.off('requestfailed', onFinished);
        clearTimeout(idleTimer);
        clearTimeout(maxTimer);
      };

      page.on('request', onRequest);
      page.on('requestfinished', onFinished);
      page.on('requestfailed', onFinished);

      maxTimer = setTimeout(() => {
        cleanup();
        resolve();
      }, maxMs);
    });
  }

  // Process each URL
  for (const [rawName, url] of records) {
    queue.add(async () => {
      const safeName = rawName.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
      const outPath = path.join(opts.outdir, `${safeName}.har`);
      console.log(`→ [${safeName}] Capturing ${url}`);

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/112.0.0.0 Safari/537.36'
      );
      await page.setCacheEnabled(false);

      page.on('response', resp => {
        console.log(`  [${safeName}] ${resp.status()} ← ${resp.url()}`);
      });

      // ← here’s the one-line fix: no captureMimeTypes filter at all
      const har = new PuppeteerHar(page);
      await har.start({
        path: outPath,
        saveResponse: true
      });

      try {
        await page.goto(url, { waitUntil: opts.waitUntil });
        await waitForNetworkIdle(page);
      } catch (err) {
        console.error(`  [${safeName}] Navigation error:`, err.message);
      }

      await har.stop();
      await page.close();
      console.log(`← [${safeName}] Saved to ${outPath}`);
    });
  }

  await queue.onIdle();
  await browser.close();
  console.log('All captures complete.');
})();
