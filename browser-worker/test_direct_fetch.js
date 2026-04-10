const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const profileDir = path.resolve(__dirname, 'profiles', 'chrome-agent-profile');
const execPath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const targetUrl = 'https://nj.myaccount.pseg.com/';

async function run() {
  console.log(`\n--- LAUNCHING FOR DIRECT DOWNLOAD TEST ---`);
  let context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    executablePath: execPath,
    headless: false,
    acceptDownloads: true,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--test-type',
      '--disable-infobars'
    ],
    ignoreDefaultArgs: [
      '--enable-automation', 
      '--no-sandbox', 
      '--disable-extensions'
    ],
    viewport: null,
  });

  let page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  console.log(`Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  
  console.log('Signaling ready...');
  fs.writeFileSync('ready_for_user.txt', 'ready');
  
  console.log('Waiting for user to log in and reach the dashboard...');
  while (!fs.existsSync('user_done.txt')) {
    await page.waitForTimeout(1000);
  }

  console.log('\n--- ATTEMPTING PROGRAMMATIC PDF DOWNLOAD ---');
  try {
    const loc = page.locator('#lnkDownloadThisBill').first();
    const isVisible = await loc.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!isVisible) {
      console.error('Could not find #lnkDownloadThisBill button on page. Make sure you are on the dashboard.');
    } else {
      const href = await loc.getAttribute('href');
      console.log('Extracted href:', href);
      
      const fileUrl = new URL(href, page.url()).toString();
      console.log('Resolved absolute URL:', fileUrl);
      
      const response = await context.request.get(fileUrl, {
        timeout: 30000,
        failOnStatusCode: false,
      });

      const status = response.status();
      const contentType = (response.headers()['content-type'] || '').toLowerCase();
      console.log(`Response Status: ${status}`);
      console.log(`Content-Type: ${contentType}`);
      
      const bytes = Buffer.from(await response.body());
      console.log(`Body length: ${bytes.length} bytes`);
      
      if (status >= 200 && status < 300 && bytes.length > 0) {
        if (contentType.includes('application/pdf')) {
          const savePath = path.resolve(__dirname, 'downloads', `bill_${Date.now()}.pdf`);
          fs.writeFileSync(savePath, bytes);
          console.log(`✅ SUCCESS! Saved PDF natively to: ${savePath}`);
        } else {
          console.error(`❌ FAILED: Expected PDF content-type, got ${contentType}`);
          console.log('Preview:', bytes.slice(0, 50).toString('utf8'));
        }
      } else {
        console.error(`❌ FAILED: Bad status code (${status}) or empty body`);
      }
    }
  } catch (err) {
    console.error('Error during direct download attempt:', err.message);
  }
  
  fs.writeFileSync('test_complete.txt', 'done');
  console.log('Closing browser...');
  await context.close();
  console.log('Done.');
  process.exit(0);
}

run().catch(console.error);
