const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const context = await chromium.launchPersistentContext(
    path.resolve('profiles/chrome-agent-profile'), 
    {
      channel: 'chrome',
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: false,
      acceptDownloads: true,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled', '--test-type', '--disable-infobars'],
      ignoreDefaultArgs: ['--enable-automation', '--no-sandbox', '--disable-extensions'],
    }
  );
  
  const execSync = require('child_process').execSync;
  try {
    const output = execSync('powershell "Get-CimInstance Win32_Process -Filter \\"Name=\'chrome.exe\'\\" | Select-Object CommandLine"', {encoding: 'utf8'});
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('chrome-agent-profile') && !line.includes('crashpad')) {
        console.log(line);
      }
    }
  } catch (e) {
    console.error(e.message);
  }
  await context.close();
})();
