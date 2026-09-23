const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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

module.exports = { isConfigured, ask, name: 'gemini' };
