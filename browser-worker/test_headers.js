const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const profileDir = path.resolve(__dirname, 'profiles', 'chrome-agent-profile');
const execPath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

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

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.goto('https://nj.myaccount.pseg.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  
  fs.writeFileSync('ready_for_user.txt', 'ready');
  while (!fs.existsSync('user_done.txt')) { await page.waitForTimeout(1000); }

  const loc = page.locator('#lnkDownloadThisBill').first();
  const href = await loc.getAttribute('href');
  const fileUrl = new URL(href, page.url()).toString();

  console.log('\n--- 1. NAKED REQUEST (What we used) ---');
  let r = await context.request.get(fileUrl, { failOnStatusCode: false });
  console.log(`Status: ${r.status()}, Content-Type: ${r.headers()['content-type']}`);

  console.log('\n--- 2. REQUEST WITH HEADERS (Proposed Fix) ---');
  const userAgent = await page.evaluate(() => navigator.userAgent);
  r = await context.request.get(fileUrl, {
    headers: {
      'User-Agent': userAgent,
      'Referer': page.url(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Upgrade-Insecure-Requests': '1'
    },
    failOnStatusCode: false
  });
  console.log(`Status: ${r.status()}, Content-Type: ${r.headers()['content-type']}`);

  fs.writeFileSync('test_complete.txt', 'done');
  await context.close();
  process.exit(0);
}
run().catch(console.error);
