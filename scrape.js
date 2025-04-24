const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const PuppeteerHar = require('puppeteer-har');

// Use the stealth plugin to help avoid detection
puppeteer.use(StealthPlugin());

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

(async () => {
  // Read the CSV file containing two columns: the HAR filename and the URL
  const csvContent = fs.readFileSync('urls', 'utf8');
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length === 0) {
    console.error("No data found in the file.");
    process.exit(1);
  }

  // Launch the browser in non-headless mode
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Set a realistic viewport and user agent
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/112.0.0.0 Safari/537.36'
  );

  // Disable cache to force all network requests to go through
  await page.setCacheEnabled(false);

  // Log responses for debugging purposes
  page.on('response', async (response) => {
    console.log(`Response from ${response.url()} with status ${response.status()}`);
  });

  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 2) {
      console.error(`Invalid line (expected two columns): ${line}`);
      continue;
    }

    const harFilename = parts[0].trim();
    const url = parts[1].trim();

    console.log(`Starting HAR capture for ${url} into file ${harFilename}.har`);

    // Start HAR capture before navigation begins
    const har = new PuppeteerHar(page);
    await har.start({
      path: `${harFilename}.har`,
      saveResponse: true,
      captureMimeTypes: [
        'application/json',
        'application/json; charset=UTF-8',
        'text/html',
        'application/xhtml+xml',
        'application/xml'
      ]
    });

    try {
      // Navigate to the URL and wait until the network is idle
      await page.goto(url, { waitUntil: 'networkidle2' });
      // Allow extra time for asynchronous requests to complete
    } catch (error) {
      console.error(`Error navigating to ${url}:`, error);
    }

    // Stop HAR capture and write the file
    await har.stop();
    console.log(`HAR capture completed for ${url}`);
  }

  await browser.close();
})();
