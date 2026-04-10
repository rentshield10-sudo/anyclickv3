const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const profileDir = path.resolve(__dirname, 'profiles', 'chrome-agent-profile');
const execPath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const targetUrl = 'https://nj.myaccount.pseg.com/';

async function getStorageState(page) {
  const cookies = await page.context().cookies();
  const ls = await page.evaluate(() => JSON.stringify(window.localStorage)).catch(()=>'{}');
  const ss = await page.evaluate(() => JSON.stringify(window.sessionStorage)).catch(()=>'{}');
  return { cookies, ls, ss };
}

async function run() {
  console.log(`\n--- RUN 1: LAUNCHING ---`);
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
  
  console.log('Waiting for user to solve challenge and signal done...');
  while (!fs.existsSync('user_done.txt')) {
    await page.waitForTimeout(1000);
  }
  
  console.log(`\n--- RUN 1: CAPTURING STATE BEFORE CLOSE ---`);
  const state1 = await getStorageState(page);
  const psegCookies1 = state1.cookies.filter(c => c.domain.includes('pseg.com') || c.name.includes('ak_') || c.name.includes('datadome') || c.name.includes('_abck'));
  console.log('PSEG/Challenge Cookies Count RUN 1:', psegCookies1.length);
  fs.writeFileSync('run1_cookies.json', JSON.stringify(psegCookies1, null, 2));
  fs.writeFileSync('run1_ls.json', state1.ls);
  
  console.log('Closing browser...');
  await context.close();
  
  await new Promise(r => setTimeout(r, 3000));
  
  console.log(`\n--- RUN 2: RELAUNCHING ---`);
  context = await chromium.launchPersistentContext(profileDir, {
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

  page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  console.log(`Navigating to ${targetUrl} again...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  
  await page.waitForTimeout(10000);

  console.log(`\n--- RUN 2: CAPTURING STATE AFTER RELAUNCH ---`);
  const state2 = await getStorageState(page);
  const psegCookies2 = state2.cookies.filter(c => c.domain.includes('pseg.com') || c.name.includes('ak_') || c.name.includes('datadome') || c.name.includes('_abck'));
  console.log('PSEG/Challenge Cookies Count RUN 2:', psegCookies2.length);
  fs.writeFileSync('run2_cookies.json', JSON.stringify(psegCookies2, null, 2));
  fs.writeFileSync('run2_ls.json', state2.ls);
  
  const finalTitle = await page.title().catch(() => '');
  console.log(`Final Page Title: ${finalTitle}`);
  const html = await page.content().catch(() => '');
  const isChallenge = html.toLowerCase().includes('datadome') || html.toLowerCase().includes('ak-challenge') || html.toLowerCase().includes('security check') || html.toLowerCase().includes('pardon our interruption') || html.toLowerCase().includes('verify you are human');
  console.log(`Challenge detected on page: ${isChallenge}`);
  
  fs.writeFileSync('test_complete.txt', 'done');
  
  console.log('Closing browser...');
  await context.close();
  console.log('Done.');
  process.exit(0);
}

run().catch(console.error);
