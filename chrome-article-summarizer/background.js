chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    summarizeUrl(request.url, request.title).then(summary => {
      sendResponse({ summary });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true; // Keep channel open for async
  }
});

async function summarizeUrl(url, title) {
  const settings = await chrome.storage.sync.get(['apiKey', 'model']);
  if (!settings.apiKey) {
    throw new Error('API Key not set. Please check extension options.');
  }

  // 1. Fetch content
  const response = await fetch(url);
  const html = await response.text();
  
  // 2. Simple text extraction (pruning)
  const plainText = html
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 10000); // Limit context size

  // 3. Call LLM
  if (settings.model.startsWith('gemini')) {
    return callGemini(settings.apiKey, settings.model, plainText, title);
  } else {
    return callOpenAI(settings.apiKey, settings.model, plainText, title);
  }
}

async function callGemini(key, model, text, title) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const prompt = `Summarize the following article titled "${title}". 
Keep the summary informative, meaningful, and between 100-150 words.
Retain the key context and most interesting points.

Article Text:
${text}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates[0].content.parts[0].text;
}

async function callOpenAI(key, model, text, title) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const prompt = `Summarize the following article titled "${title}". 
Keep the summary informative, meaningful, and between 100-150 words.
Retain the key context and most interesting points.

Article Text:
${text}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}
