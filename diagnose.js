import { chromium } from 'playwright';

async function diagnose() {
  console.log("Launching system Google Chrome...");
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/usr/bin/google-chrome'
  });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[Console] ${msg.type()}: ${msg.text()}`);
  });
  
  page.on('pageerror', err => {
    console.error(`[Page Error] ${err.message}`);
    console.error(err.stack);
  });

  page.on('request', req => {
    console.log(`-> Request: ${req.method()} ${req.url()}`);
  });

  page.on('response', res => {
    console.log(`<- Response: ${res.status()} ${res.url()}`);
  });
  
  console.log("Navigating to https://issues-mel-fly-rna.trycloudflare.com ...");
  try {
    await page.goto('https://issues-mel-fly-rna.trycloudflare.com', { timeout: 20000 });
    console.log("Page loaded. Waiting 3 seconds...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const rootHtml = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.innerHTML : 'Root element not found';
    });
    
    console.log("---------------- ROOT HTML CONTENT ----------------");
    console.log(rootHtml);
    console.log("---------------------------------------------------");
  } catch (err) {
    console.error("Navigation error:", err);
  } finally {
    await browser.close();
    console.log("Browser closed.");
  }
}

diagnose();

