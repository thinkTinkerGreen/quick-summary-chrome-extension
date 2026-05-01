document.getElementById('save').addEventListener('click', () => {
  const apiKey = document.getElementById('apiKey').value;
  const model = document.getElementById('model').value;
  
  chrome.storage.sync.set({ apiKey, model }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Settings saved successfully!';
    setTimeout(() => {
      status.textContent = '';
    }, 2000);
  });
});

// Load existing settings
chrome.storage.sync.get(['apiKey', 'model'], (result) => {
  if (result.apiKey) {
    document.getElementById('apiKey').value = result.apiKey;
  }
  if (result.model) {
    document.getElementById('model').value = result.model;
  }
});
