// This vault stores our URLs and prevents duplicates automatically
const imageVault = new Set();

// Function to find images and lock them in the vault
function harvestImages() {
  const images = Array.from(document.querySelectorAll('img[src*="pinimg.com"]'));
  images.forEach(img => {
    // Convert thumbnail to high-res original
    const highRes = img.src.replace(/\/\d+x\//, '/originals/');
    imageVault.add(highRes);
  });
}

// Run it immediately when the page loads
harvestImages();

// Watch the webpage for any new images loading as you scroll
const observer = new MutationObserver(() => {
  harvestImages();
});
observer.observe(document.body, { childList: true, subtree: true });

// Listen for the button click from the popup menu
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  harvestImages(); // One last check just in case
  
  const urls = Array.from(imageVault);

  if (urls.length === 0) {
    chrome.runtime.sendMessage({ status: "No images found. Did you scroll?" });
    return;
  }

  if (request.action === 'copy') {
    const textToCopy = urls.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      chrome.runtime.sendMessage({ status: `Copied ${urls.length} URLs!` });
    });
  } 
  
  else if (request.action === 'download') {
    chrome.runtime.sendMessage({ status: `Preparing ${urls.length} images...` });
    chrome.runtime.sendMessage({ 
        action: 'trigger_downloads', 
        urls: urls 
    });
  }
});