const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const { sseLines } = require('./sse');

function isConfigured() {
  return !!process.env.OPENROUTER_API_KEY;
}

function modelList() {
  return String(process.env.OPENROUTER_MODEL || 'nex-agi/nex-n2.5-mini:free')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

async function callModel(model, { systemPrompt, userPrompt, timeoutMs, maxTokens = 600, temperature = 0.2 }) {
  const key = process.env.OPENROUTER_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': process.env.BASE_URL || 'http://localhost:3000',
        'X-Title': 'Station Help Assistant',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || (body && body.error)) {
      const err = new Error((body && body.error && body.error.message) || `OpenRouter HTTP ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }
    const text = body?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('OpenRouter tra ve rong');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function ask({ systemPrompt, userPrompt, timeoutMs = 30000, maxTokens = 600, temperature = 0.2 }) {
  if (!process.env.OPENROUTER_API_KEY) {
    const err = new Error('OpenRouter chua cau hinh');
    err.providerFatal = true;
    throw err;
  }
  const models = modelList();
  const perModelTimeout = Math.max(8000, Math.floor(timeoutMs / models.length));
  let lastErr = null;
  for (const model of models) {
    try {
      const text = await callModel(model, { systemPrompt, userPrompt, timeoutMs: perModelTimeout, maxTokens, temperature });
      return { text, model };
    } catch (err) {
      lastErr = err;
      const code = err.statusCode;
      if (code === 401 || code === 403) throw err;
    }
  }
  throw lastErr || new Error('OpenRouter that bai');
}

async function streamModel(model, { systemPrompt, userPrompt, timeoutMs, maxTokens, temperature, onDelta }) {
  const key = process.env.OPENROUTER_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let emitted = false;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': process.env.BASE_URL || 'http://localhost:3000',
        'X-Title': 'Station Help Assistant',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const err = new Error((body && body.error && body.error.message) || `OpenRouter HTTP ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }
    let full = '';
    for await (const data of sseLines(res.body)) {
      if (data === '[DONE]') break;
      let obj;
      try { obj = JSON.parse(data); } catch { continue; }
      const t = obj?.choices?.[0]?.delta?.content || '';
      if (t) { full += t; emitted = true; if (onDelta) onDelta(t); }
    }
    if (!full) throw new Error('OpenRouter tra ve rong');
    return { text: full, model };
  } catch (err) {
    err.emitted = emitted;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function streamAsk({ systemPrompt, userPrompt, timeoutMs = 60000, maxTokens = 600, temperature = 0.2, onDelta }) {
  if (!process.env.OPENROUTER_API_KEY) {
    const err = new Error('OpenRouter chua cau hinh');
    err.providerFatal = true;
    throw err;
  }
  const models = modelList();
  const perModelTimeout = Math.max(15000, Math.floor(timeoutMs / models.length));
  let lastErr = null;
  for (const model of models) {
    try {
      return await streamModel(model, { systemPrompt, userPrompt, timeoutMs: perModelTimeout, maxTokens, temperature, onDelta });
    } catch (err) {
      lastErr = err;
      if (err.emitted) throw err;
      const code = err.statusCode;
      if (code === 401 || code === 403) throw err;
    }
  }
  throw lastErr || new Error('OpenRouter that bai');
}

module.exports = { isConfigured, ask, streamAsk, modelList, name: 'openrouter' };
