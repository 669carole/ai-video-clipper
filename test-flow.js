import { chromium } from 'playwright';

async function runTestFlow() {
  console.log("🚀 Starting Playwright User Flow Test...");
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome'
  });
  
  const page = await browser.newPage();
  
  // Register event listeners to capture issues
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error' || text.toLowerCase().includes('error') || text.toLowerCase().includes('fail')) {
      console.log(`🔴 [Browser Console - ${type.toUpperCase()}] ${text}`);
    } else {
      console.log(`[Browser Console - ${type}] ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`❌ [Page Exception] ${err.message}`);
    console.error(err.stack);
  });

  page.on('requestfailed', req => {
    console.error(`⚠️ [Request Failed] ${req.method()} ${req.url()} - Error: ${req.failure()?.errorText}`);
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      console.error(`❌ [Response Error ${res.status()}] ${res.url()}`);
    }
  });

  try {
    // 1. Navigate to home
    console.log("Step 1: Navigating to https://issues-mel-fly-rna.trycloudflare.com ...");
    await page.goto('https://issues-mel-fly-rna.trycloudflare.com', { timeout: 20000 });
    
    // Check if input is visible
    const inputSelector = 'input[placeholder*="YouTube"]';
    await page.waitForSelector(inputSelector, { timeout: 5000 });
    console.log("Home page loaded successfully.");

    // 2. Paste URL and Fetch
    const youtubeUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Me at the zoo (short, perfect for fast test)
    console.log(`Step 2: Pasting URL: ${youtubeUrl}`);
    await page.fill(inputSelector, youtubeUrl);
    
    const fetchButtonSelector = 'button:has-text("Fetch & Analyze")';
    await page.click(fetchButtonSelector);
    console.log("Clicked 'Fetch & Analyze'. Waiting for video info and AI highlights...");

    // Wait for the video card / details to appear
    const detailsHeaderSelector = 'h3:has-text("Video Details")';
    await page.waitForSelector(detailsHeaderSelector, { timeout: 60000 });
    console.log("✅ Video details loaded successfully.");

    // Wait for AI moment suggestions to finish loading (isDetectingMoments changes from true to false)
    console.log("Waiting for AI analysis to complete...");
    await page.waitForSelector('button:has-text("Edit Clip")', { timeout: 30000 });
    console.log("✅ AI moment suggestions detected and rendered.");

    // Get all clips count
    const editButtons = await page.$$('button:has-text("Edit Clip")');
    console.log(`Found ${editButtons.length} detected moments.`);

    // 3. Click the first "Edit Clip" button
    console.log("Step 3: Clicking 'Edit Clip' to navigate to editor...");
    await editButtons[0].click();

    // Wait for Editor page to mount
    const backBtnSelector = 'button:has-text("Back to Dashboard")';
    await page.waitForSelector(backBtnSelector, { timeout: 10000 });
    console.log("✅ Editor page loaded.");

    // Verify video element source
    const videoSrc = await page.$eval('video', el => el.src);
    console.log(`Video element src resolved to: ${videoSrc}`);
    if (!videoSrc) {
      console.error("🔴 Video element src is empty!");
    }

    // 4. Test editor options
    console.log("Step 4: Interacting with editor panel options...");

    // Click Captions Style tab
    console.log("Switching to 'Captions Style' tab...");
    await page.click('button:has-text("Captions Style")');
    await page.waitForTimeout(500);
    // Click neon-glow preset
    console.log("Selecting 'Neon Glow' caption template...");
    await page.click('button:has-text("Neon Glow")');
    await page.waitForTimeout(500);

    // Click Crop Ratio tab
    console.log("Switching to 'Crop Ratio' tab...");
    await page.click('button:has-text("Crop Ratio")');
    await page.waitForTimeout(500);
    // Click 9:16 Vertical
    console.log("Selecting '9:16 Vertical' crop ratio...");
    await page.click('button:has-text("9:16 Vertical")');
    await page.waitForTimeout(500);

    // Click Filters tab
    console.log("Switching to 'Filters' tab...");
    await page.click('button:has-text("Filters")');
    await page.waitForTimeout(500);
    // Click Vibrant Pop filter
    console.log("Selecting 'Vibrant Pop' color grade filter...");
    await page.click('button:has-text("Vibrant Pop")');
    await page.waitForTimeout(500);

    // Click Audio Mixer tab
    console.log("Switching to 'Audio Mixer' tab...");
    await page.click('button:has-text("Audio Mixer")');
    await page.waitForTimeout(500);
    // Click Lofi Chill Beat background track
    console.log("Selecting background music track...");
    await page.click('button:has-text("Lofi Chill Beat")');
    await page.waitForTimeout(500);

    // 5. Proceed to Export
    console.log("Step 5: Clicking 'Proceed to Export'...");
    await page.click('button:has-text("Proceed to Export")');

    // Wait for Export page to load
    await page.waitForSelector('button:has-text("Start Video Render")', { timeout: 10000 });
    console.log("✅ Export page loaded.");

    // 6. Trigger Render
    console.log("Step 6: Triggering video rendering engine...");
    await page.click('button:has-text("Start Video Render")');
    
    // Wait for render queue to update progress to completed
    console.log("Waiting for video render to complete (should take a few seconds)...");
    
    let isCompleted = false;
    let attempts = 0;
    while (!isCompleted && attempts < 30) {
      const statusText = await page.$eval('.glass-card span border', el => el.textContent.trim()).catch(() => '');
      const progressText = await page.$eval('.glass-card span:has-text("Progress:")', el => el.textContent.trim()).catch(() => '');
      
      console.log(`Current Render Queue Status: "${statusText}" | Progress: "${progressText}"`);
      
      if (statusText.toLowerCase() === 'completed' || progressText.includes('100%')) {
        isCompleted = true;
        break;
      }
      if (statusText.toLowerCase() === 'failed') {
        console.error("🔴 Render failed in the queue!");
        break;
      }
      
      await page.waitForTimeout(2000);
      attempts++;
    }

    if (isCompleted) {
      console.log("✅ Video render completed successfully!");
      // Check if download link is visible
      const downloadLinkExists = await page.$eval('a:has-text("Download directly")', el => !!el).catch(() => false);
      console.log(`Download link exists in DOM: ${downloadLinkExists}`);
    } else {
      console.error("🔴 Render flow timed out or failed.");
    }

  } catch (err) {
    console.error("Test Flow Exception:", err);
  } finally {
    await browser.close();
    console.log("Browser closed. Test ended.");
  }
}

runTestFlow();
