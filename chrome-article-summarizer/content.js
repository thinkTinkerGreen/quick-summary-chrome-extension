let links = [];
let currentIndex = -1;
let isPlaying = false;
let utterance = null;

// --- Link Extraction ---
function extractLinks() {
  const extracted = [];
  const seen = new Set();

  // Site specific extraction
  if (window.location.host === 'news.ycombinator.com') {
    document.querySelectorAll('.titleline > a').forEach(a => {
      const url = a.href;
      if (!url.startsWith('item?id=') && !seen.has(url)) {
        extracted.push({ title: a.innerText, url: url });
        seen.add(url);
      }
    });
  } else {
    // Generic extraction: link with 5+ words
    document.querySelectorAll('a').forEach(a => {
      const text = a.innerText.trim();
      const wordCount = text.split(/\s+/).length;
      if (wordCount > 5 && a.href.startsWith('http') && !seen.has(a.href)) {
        extracted.push({ title: text, url: a.href });
        seen.add(a.href);
      }
    });
  }
  return extracted;
}

// --- UI Injection ---
function createOverlay() {
  if (document.getElementById('linkpulse-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'linkpulse-overlay';
  overlay.innerHTML = `
    <div id="linkpulse-header">
      <div id="linkpulse-title">Quick Summary</div>
      <div id="linkpulse-controls">
        <button class="linkpulse-btn" id="linkpulse-close">✕</button>
      </div>
    </div>
    <div id="linkpulse-content">
      <div id="linkpulse-loader"><div class="pulse"></div></div>
      <div id="linkpulse-body">
        <div id="linkpulse-article-title">Select an article to begin</div>
        <div id="linkpulse-summary">Use the player controls below to traverse articles on this page.</div>
      </div>
    </div>
    <div id="linkpulse-footer">
      <div class="linkpulse-nav">
        <div class="linkpulse-player-btn" id="linkpulse-prev">⏮</div>
        <div class="linkpulse-player-btn" id="linkpulse-play">▶</div>
        <div class="linkpulse-player-btn" id="linkpulse-next">⏭</div>
      </div>
      <div id="linkpulse-index">0 / 0</div>
    </div>
    <div class="linkpulse-resize-handle" id="linkpulse-resize"></div>
  `;
  document.body.appendChild(overlay);

  // Setup interactions
  setupDraggable(overlay, document.getElementById('linkpulse-header'));
  setupResizable(overlay, document.getElementById('linkpulse-resize'));

  document.getElementById('linkpulse-close').onclick = () => overlay.remove();
  document.getElementById('linkpulse-next').onclick = () => navigateArticle(1);
  document.getElementById('linkpulse-prev').onclick = () => navigateArticle(-1);
  document.getElementById('linkpulse-play').onclick = toggleSpeech;
}

// --- Navigation & Summarization ---
async function navigateArticle(direction) {
  if (links.length === 0) {
    links = extractLinks();
    if (links.length === 0) return;
  }

  currentIndex = (currentIndex + direction + links.length) % links.length;
  updateUIForNewArticle();

  const article = links[currentIndex];
  showLoader(true);

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'summarize',
      url: article.url,
      title: article.title
    });

    if (response.error) {
      document.getElementById('linkpulse-summary').innerText = "Error: " + response.error;
    } else {
      document.getElementById('linkpulse-summary').innerText = response.summary;
      // Stop speech if it was playing
      stopSpeech();
    }
  } catch (err) {
    document.getElementById('linkpulse-summary').innerText = "Failed to fetch summary.";
  } finally {
    showLoader(false);
  }
}

function updateUIForNewArticle() {
  const article = links[currentIndex];
  document.getElementById('linkpulse-article-title').innerText = article.title;
  document.getElementById('linkpulse-summary').innerText = "Summarizing article...";
  document.getElementById('linkpulse-index').innerText = `${currentIndex + 1} / ${links.length}`;
}

function showLoader(show) {
  document.getElementById('linkpulse-loader').style.display = show ? 'flex' : 'none';
  document.getElementById('linkpulse-body').style.display = show ? 'none' : 'block';
}

// --- TTS Logic ---
function toggleSpeech() {
  if (isPlaying) {
    stopSpeech();
  } else {
    const text = document.getElementById('linkpulse-summary').innerText;
    if (!text || text.startsWith("Summarizing")) return;

    utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = stopSpeech;
    window.speechSynthesis.speak(utterance);
    isPlaying = true;
    document.getElementById('linkpulse-play').innerText = '⏸';
  }
}

function stopSpeech() {
  window.speechSynthesis.cancel();
  isPlaying = false;
  document.getElementById('linkpulse-play').innerText = '▶';
}

// --- Draggable ---
function setupDraggable(el, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    el.style.top = (el.offsetTop - pos2) + "px";
    el.style.left = (el.offsetLeft - pos1) + "px";
    el.style.right = 'auto'; // Disable right-lock after move
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// --- Resizable ---
function setupResizable(el, handle) {
  handle.onmousedown = (e) => {
    e.preventDefault();
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResize);
  };

  function resize(e) {
    el.style.width = (e.clientX - el.offsetLeft) + 'px';
    el.style.height = (e.clientY - el.offsetTop) + 'px';
  }

  function stopResize() {
    window.removeEventListener('mousemove', resize);
  }
}

// Initialize on page load if it's a target page
if (window.location.host === 'news.ycombinator.com') {
  createOverlay();
  links = extractLinks();
  document.getElementById('linkpulse-index').innerText = `0 / ${links.length}`;
}

// Listen for messages from popup (optional toggle)
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'toggle') {
    createOverlay();
  }
});
