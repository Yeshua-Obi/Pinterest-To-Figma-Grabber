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

// Catch the URLs and zip them
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.status) {
    document.getElementById('status').innerText = request.status;
  }
  
  if (request.action === 'trigger_downloads' && request.urls) {
    document.getElementById('status').innerText = `Preparing ${request.urls.length} images... DO NOT CLOSE THIS MENU!`;
    
    const zip = new JSZip();
    const folder = zip.folder("Pinterest_Figma_Grab");
    let count = 0;

    // Fetch all images and add them to the zip
    Promise.all(request.urls.map((url, index) => {
      return fetch(url)
        .then(response => response.blob())
        .then(blob => {
          // Extract the correct file extension (.jpg, .png, etc) from the URL
          const ext = url.split('.').pop().split('?')[0] || 'jpg';
          folder.file(`Image_${index + 1}.${ext}`, blob);
          count++;
          document.getElementById('status').innerText = `Packed ${count} / ${request.urls.length}... DO NOT CLOSE!`;
        })
        .catch(err => console.error("Failed to fetch image", err));
    })).then(() => {
      document.getElementById('status').innerText = "Generating final ZIP file...";
      
      zip.generateAsync({ type: "blob" }).then(function(content) {
        const zipUrl = URL.createObjectURL(content);
        chrome.downloads.download({
          url: zipUrl,
          filename: `Pinterest_Board.zip`,
          saveAs: false
        });
        document.getElementById('status').innerText = "Success! ZIP Downloaded.";
      });
    });
  }
});