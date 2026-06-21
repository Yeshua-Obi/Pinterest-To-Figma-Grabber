document.getElementById('downloadBtn').addEventListener('click', () => {
  executeScraper('download');
});

document.getElementById('copyBtn').addEventListener('click', () => {
  executeScraper('copy');
});

function executeScraper(action) {
  document.getElementById('status').innerText = "Working...";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: action });
  });
}

function fetchImageViaBackground(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'fetch_image', url }, (response) => {
      if (response?.success) resolve(response.dataUrl);
      else reject(new Error(response?.error || 'Fetch failed'));
    });
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

// Try highRes first; if it fails or comes back invalid, try the 736x fallback
async function fetchWithFallback(entry) {
  try {
    const dataUrl = await fetchImageViaBackground(entry.highRes);
    // Pinterest sometimes returns a tiny error-page "image" — guard against that
    if (dataUrl && dataUrl.length > 2000) {
      return dataUrl;
    }
    throw new Error('Originals image too small/invalid');
  } catch (err) {
    console.warn('[Pinterest DL] originals failed, trying fallback:', entry.fallback, err.message);
    return await fetchImageViaBackground(entry.fallback);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.status) {
    document.getElementById('status').innerText = request.status;
  }

  if (request.action === 'trigger_downloads' && request.entries) {
    document.getElementById('status').innerText = `Preparing ${request.entries.length} images... DO NOT CLOSE THIS MENU!`;

    const zip = new JSZip();
    const folder = zip.folder("Pinterest_Figma_Grab");
    let count = 0;
    let failed = 0;

    Promise.all(request.entries.map(async (entry, index) => {
      try {
        const dataUrl = await fetchWithFallback(entry);
        const blob = dataUrlToBlob(dataUrl);
        const ext = entry.highRes.split('.').pop().split('?')[0] || 'jpg';
        folder.file(`Image_${index + 1}.${ext}`, blob);
        count++;
        document.getElementById('status').innerText = `Packed ${count} / ${request.entries.length}... DO NOT CLOSE!`;
      } catch (err) {
        failed++;
        console.error("Failed to fetch image (both originals and fallback)", entry, err);
      }
    })).then(() => {
      document.getElementById('status').innerText = "Generating final ZIP file...";

      zip.generateAsync({ type: "blob" }).then(function(content) {
        const zipUrl = URL.createObjectURL(content);
        chrome.downloads.download({
          url: zipUrl,
          filename: `Pinterest_Board.zip`,
          saveAs: false
        });
        document.getElementById('status').innerText = failed > 0
          ? `Done! ${count} downloaded, ${failed} failed.`
          : "Success! ZIP Downloaded.";
      });
    });
  }
});