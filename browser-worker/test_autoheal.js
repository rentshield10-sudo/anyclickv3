const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// We are going to directly test the download logic by importing it, 
// or by mimicking it exactly to prove the engine auto-heal logic.
// However, since it relies on a global `page` state in the engine,
// let's just write a direct runner that mocks the DOM and runs the exact JS logic.

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Create a local test server for the PDF endpoint
  const express = require('express');
  const app = express();
  
  app.get('/fake.pdf', (req, res) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from('%PDF-1.4 mock pdf bytes here'));
  });
  
  app.get('/not-a-pdf', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send('<html><body>Not a PDF</body></html>');
  });

  const server = app.listen(3002);

  // Setup Mock HTML Page
  const htmlContent = `
    <html>
      <body>
        <!-- Case 1: SUCCESS (Auto-heal descendant) -->
        <div id="wrapper-25">
           <span>Some icon</span>
           <a href="http://localhost:3002/fake.pdf">Download Bill</a>
        </div>

        <!-- Case 2: FAILURE (Fallback triggered) -->
        <a id="bad-link" href="http://localhost:3002/not-a-pdf">Bad Link</a>
        
        <!-- Case 3: SUCCESS (Auto-heal ancestor) -->
        <a href="http://localhost:3002/fake.pdf">
           <span id="inner-span">Click Me</span>
        </a>
      </body>
    </html>
  `;
  await page.setContent(htmlContent);

  // The Exact Auto-Heal Logic from the Engine
  async function testDownloadLogic(selector) {
    console.log(`\n--- TESTING SELECTOR: ${selector} ---`);
    const loc = page.locator(selector).first();
    
    const linkInfo = await loc.evaluate((el) => {
      const originalTagName = el.tagName;
      
      // 1. Check if the element itself is an A tag
      if (originalTagName === 'A') {
        return { originalTagName, resolvedTagName: 'A', href: el.getAttribute('href'), healed: false };
      }
      
      // 2. Check ancestors
      const ancestor = el.closest('a');
      if (ancestor) {
        return { originalTagName, resolvedTagName: 'A', href: ancestor.getAttribute('href'), healed: 'ancestor' };
      }
      
      // 3. Check descendants
      const child = el.querySelector('a');
      if (child) {
        return { originalTagName, resolvedTagName: 'A', href: child.getAttribute('href'), healed: 'descendant' };
      }
      
      return { originalTagName, resolvedTagName: originalTagName, href: el.getAttribute('href'), healed: false };
    }).catch(() => ({ originalTagName: '', resolvedTagName: '', href: null, healed: false }));

    console.log('LOG: Analyzed target for download link resolution:');
    console.log(JSON.stringify({
      selector,
      originalTagName: linkInfo.originalTagName,
      resolvedTagName: linkInfo.resolvedTagName,
      healed: linkInfo.healed,
      href: linkInfo.href
    }, null, 2));

    const { resolvedTagName, href } = linkInfo;

    if (resolvedTagName === 'A' && href && !href.startsWith('javascript:') && !href.startsWith('#')) {
      const fileUrl = new URL(href, page.url()).toString();
      console.log(`LOG: Attempting direct API fetch for download link: ${fileUrl}`);

      const response = await page.context().request.get(fileUrl, { timeout: 5000, failOnStatusCode: false });
      const status = response.status();
      const contentType = (response.headers()['content-type'] || '').toLowerCase();
      const bytes = Buffer.from(await response.body());

      if (status >= 200 && status < 300 && bytes.length > 0) {
        if (contentType.includes('application/pdf')) {
          console.log(`LOG: Successfully downloaded file via direct API fetch! (Bytes: ${bytes.length})`);
        } else {
          console.log(`LOG [WARN]: Direct fetch response did not look like a file/PDF, falling back to UI click. Status=${status}, ContentType=${contentType}`);
        }
      } else {
        console.log(`LOG [WARN]: Direct fetch failed or empty, falling back to UI click. Status=${status}`);
      }
    } else {
      console.log(`LOG [WARN]: Element not resolvable to a valid link. Falling back to UI click.`);
    }
  }

  // Run the cases
  await testDownloadLogic('#wrapper-25'); // Heals wrapper -> A
  await testDownloadLogic('#bad-link');   // Finds A, but content fails
  await testDownloadLogic('#inner-span'); // Heals span -> A

  server.close();
  await browser.close();
}

runTest().catch(console.error);
