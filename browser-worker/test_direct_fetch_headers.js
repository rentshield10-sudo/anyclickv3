const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const profileDir = path.resolve(__dirname, 'profiles', 'chrome-agent-profile');
const execPath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const targetUrl = 'https://nj.myaccount.pseg.com/';

async function run() {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    executablePath: execPath,
    headless: false,
    acceptDownloads: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled', '--test-type', '--disable-infobars'],
    ignoreDefaultArgs: ['--enable-automation', '--no-sandbox', '--disable-extensions'],
    viewport: null,
  });

  let page = context.pages()[0];
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  
  fs.writeFileSync('ready_for_user.txt', 'ready');
  while (!fs.existsSync('user_done.txt')) { await page.waitForTimeout(1000); }

  const href = await page.locator('#lnkDownloadThisBill').first().getAttribute('href');
  const fileUrl = new URL(href, page.url()).toString();

  // Test 1: Naked Request
  console.log('\n--- TEST 1: NAKED REQUEST ---');
  const r1 = await context.request.get(fileUrl, { failOnStatusCode: false });
  console.log(`Status: ${r1.status()}, Content-Type: ${r1.headers()['content-type']}`);
  const b1 = await r1.body();
  console.log(`Preview: ${b1.slice(0, 30).toString()}`);

  // Test 2: Request with Headers
  console.log('\n--- TEST 2: REQUEST WITH HEADERS ---');
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const r2 = await context.request.get(fileUrl, {
    headers: {
      'User-Agent': userAgent,
      'Referer': page.url(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    },
    failOnStatusCode: false 
  });
  console.log(`Status: ${r2.status()}, Content-Type: ${r2.headers()['content-type']}`);
  const b2 = await r2.body();
  console.log(`Preview: ${b2.slice(0, 30).toString()}`);

  // Test 3: Page Evaluate Fetch
  console.log('\n--- TEST 3: PAGE EVALUATE FETCH ---');
  const result = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url);
      const ct = res.headers.get('content-type');
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const base64 = btoa(new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        return { status: res.status, contentType: ct, base64: base64.slice(0, 40) + '...' };
      }
      return { status: res.status, contentType: ct, preview: await res.text().then(t => t.slice(0, 30)) };
    } catch(e) { return { error: e.message }; }
  }, fileUrl);
  console.log(result);

  fs.writeFileSync('test_complete.txt', 'done');
  await context.close();
  process.exit(0);
}
run().catch(console.error);
