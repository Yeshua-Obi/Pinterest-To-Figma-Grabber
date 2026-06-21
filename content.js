const imageVault = new Map();
let currentPath = location.pathname;

const navObserver = new MutationObserver(() => {
  if (location.pathname !== currentPath) {
    currentPath = location.pathname;
    imageVault.clear();
  }
});
navObserver.observe(document.body, { childList: true, subtree: true });

function extractFingerprint(url) {
  const clean = url.split('?')[0];
  const filename = clean.substring(clean.lastIndexOf('/') + 1);
  const fingerprint = filename.replace(/\.[^/.]+$/, '').replace(/_[nbtqmsczhlo]$/, '');
  return { fingerprint, clean };
}

function tryAddImage(src) {
  if (!src) return;
  if (!src.match(/\/(236x|474x|564x|736x|1200x)\//)) return;
  const { fingerprint, clean } = extractFingerprint(src);
  if (!imageVault.has(fingerprint)) {
    // Store BOTH the originals URL and a 736x fallback
    const highRes = clean.replace(/\/\d+x\//, '/originals/');
    const fallback = clean.replace(/\/\d+x\//, '/736x/');
    imageVault.set(fingerprint, { highRes, fallback });
  }
}

function harvestVideoPosters() {
  const videos = document.querySelectorAll('video[poster*="pinimg.com"]');

  videos.forEach(video => {
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let el = video.parentElement;
    let isRecommendation = false;
    for (let i = 0; i < 6; i++) {
      if (!el) break;
      const elStyle = el.getAttribute('style') || '';
      if (elStyle.includes('height: 207px')) {
        isRecommendation = true;
        break;
      }
      el = el.parentElement;
    }
    if (isRecommendation) return;

    const before = imageVault.size;
    tryAddImage(video.poster);
    if (imageVault.size > before) {
      console.log('[Pinterest DL] Video poster captured:', video.poster);
    }
  });
}

function harvestImages() {
  const images = document.querySelectorAll('img[src*="pinimg.com"]');

  images.forEach(img => {
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    if (!img.src.match(/\/(236x|474x|564x|736x|1200x)\//)) return;

    const carouselContainer = img.closest('[data-test-id="pinrep-carousel"]');
    if (carouselContainer) {
      const style = carouselContainer.getAttribute('style') || '';
      const isFirstSlide = style.includes('translate(0%, 0%)');
      if (!isFirstSlide) return;
    }

    let el = img.parentElement;
    let isRecommendation = false;
    for (let i = 0; i < 6; i++) {
      if (!el) break;
      const elStyle = el.getAttribute('style') || '';
      if (elStyle.includes('height: 207px')) {
        isRecommendation = true;
        break;
      }
      el = el.parentElement;
    }
    if (isRecommendation) return;

    tryAddImage(img.src);
  });

  harvestVideoPosters();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrollPass(direction) {
  const STEP = 100;
  const STABLE_LIMIT = 14;
  let lastHeight = document.body.scrollHeight;
  let unchangedCount = 0;

  while (true) {
    if (direction === 'down') {
      window.scrollBy(0, STEP);
    } else {
      window.scrollBy(0, -STEP);
    }

    harvestImages();
    chrome.runtime.sendMessage({ status: `Scrolling ${direction}... found ${imageVault.size} pins` });

    await wait(180);

    if (direction === 'down') {
      const newHeight = document.body.scrollHeight;
      const atBottom = (window.scrollY + window.innerHeight) >= (newHeight - 50);

      if (newHeight === lastHeight && atBottom) {
        unchangedCount++;
        if (unchangedCount >= STABLE_LIMIT) break;
      } else {
        unchangedCount = 0;
        lastHeight = newHeight;
      }
    } else {
      if (window.scrollY <= 0) break;
    }
  }
}

async function harvestAllVideosDirectly() {
  window.scrollTo(0, 0);
  await wait(800);

  let stillCount = 0;

  while (true) {
    window.scrollBy(0, 150);
    await wait(350);
    harvestImages();

    const atBottom = (window.scrollY + window.innerHeight) >= (document.body.scrollHeight - 50);
    if (atBottom) {
      stillCount++;
      if (stillCount >= 4) break;
    } else {
      stillCount = 0;
    }
  }
}

async function autoScrollAndHarvest(callback) {
  harvestImages();

  chrome.runtime.sendMessage({ status: 'Pass 1: scrolling down...' });
  await scrollPass('down');

  chrome.runtime.sendMessage({ status: `Pass 2: scrolling back up (found ${imageVault.size})...` });
  await scrollPass('up');

  chrome.runtime.sendMessage({ status: `Pass 3: final sweep down (found ${imageVault.size})...` });
  await scrollPass('down');

  chrome.runtime.sendMessage({ status: `Pass 4: slow video sweep (found ${imageVault.size})...` });
  await harvestAllVideosDirectly();

  chrome.runtime.sendMessage({ status: `Final check (found ${imageVault.size})...` });
  await wait(1500);
  harvestImages();

  chrome.runtime.sendMessage({ status: `Done! Found ${imageVault.size} pins.` });
  await wait(500);
  callback();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download' || request.action === 'copy') {
    imageVault.clear();
    chrome.runtime.sendMessage({ status: 'Scrolling slowly to catch every pin...' });

    autoScrollAndHarvest(() => {
      // Each entry is now { highRes, fallback } instead of a plain string
      const entries = Array.from(imageVault.values());

      if (entries.length === 0) {
        chrome.runtime.sendMessage({ status: 'No images found.' });
        return;
      }

      if (request.action === 'copy') {
        const urls = entries.map(e => e.highRes);
        console.log('[Pinterest DL] Full URL list:', urls);
        window.focus();
        setTimeout(() => {
          navigator.clipboard.writeText(urls.join('\n')).then(() => {
            chrome.runtime.sendMessage({ status: `Copied ${urls.length} URLs!` });
          }).catch(err => {
            console.error('[Pinterest DL] Clipboard write failed:', err);
            chrome.runtime.sendMessage({ status: `Found ${urls.length} URLs (check console — clipboard failed)` });
          });
        }, 300);
      } else if (request.action === 'download') {
        chrome.runtime.sendMessage({ status: `Preparing ${entries.length} images...` });
        // Send both highRes and fallback so popup.js can try originals first, then 736x
        chrome.runtime.sendMessage({ action: 'trigger_downloads', entries: entries });
      }
    });
  }
});