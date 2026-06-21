chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetch_image') {
    fetch(request.url)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, dataUrl: reader.result });
        };
        reader.readAsDataURL(blob);
      })
      .catch(e => sendResponse({ success: false, error: e.message }));

    return true; // keep channel open for async response
  }
});