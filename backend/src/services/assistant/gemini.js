const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const { sseLines } = require('./sse');

function isConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

async function ask({ systemPrompt, userPrompt, timeoutMs = 15000, maxTokens = 600, temperature = 0.2 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('GEMINI chua cau hinh');
    err.providerFatal = true;
    throw err;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((body && body.error && body.error.message) || `Gemini HTTP ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }
    const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n').trim();
    if (!text) throw new Error('Gemini tra ve rong');
    return { text, model };
  } finally {
    clearTimeout(timer);
  }
}

async function streamAsk({ systemPrompt, userPrompt, timeoutMs = 60000, maxTokens = 600, temperature = 0.2, onDelta }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('GEMINI chua cau hinh');
    err.providerFatal = true;
    throw err;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let full = '';
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const err = new Error((body && body.error && body.error.message) || `Gemini HTTP ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }
    for await (const data of sseLines(res.body)) {
      let obj;
      try { obj = JSON.parse(data); } catch { continue; }
      const t = (obj?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join('');
      if (t) { full += t; if (onDelta) onDelta(t); }
    }
    if (!full) throw new Error('Gemini tra ve rong');
    return { text: full, model };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isConfigured, ask, streamAsk, name: 'gemini' };
