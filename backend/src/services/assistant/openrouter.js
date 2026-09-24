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

function visionModelList() {
  return String(process.env.OPENROUTER_VISION_MODEL || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

function supportsVision() {
  return isConfigured() && visionModelList().length > 0;
}

function toContent(userPrompt, files) {
  const content = [{ type: 'text', text: userPrompt }];
  for (const f of files || []) {
    if (f && f.base64 && f.mime && String(f.mime).startsWith('image/')) {
      content.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${f.base64}` } });
    }
  }
  return content;
}

async function callModel(model, { systemPrompt, userPrompt, files, timeoutMs, maxTokens = 600, temperature = 0.2 }) {
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
          { role: 'user', content: toContent(userPrompt, files) },
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
    const u = body?.usage || null;
    const usage = u ? { prompt: u.prompt_tokens || 0, completion: u.completion_tokens || 0 } : null;
    return { text, usage };
  } finally {
    clearTimeout(timer);
  }
}

async function ask({ systemPrompt, userPrompt, files, models, timeoutMs = 30000, maxTokens = 600, temperature = 0.2 }) {
  if (!process.env.OPENROUTER_API_KEY) {
    const err = new Error('OpenRouter chua cau hinh');
    err.providerFatal = true;
    throw err;
  }
  const list = (models && models.length > 0)
    ? models
    : ((files && files.length > 0) ? visionModelList() : modelList());
  if (list.length === 0) {
    const err = new Error(files && files.length > 0 ? 'OpenRouter chua cau hinh model thi giac' : 'OpenRouter that bai');
    err.providerFatal = true;
    throw err;
  }
  const perModelTimeout = Math.max(8000, Math.floor(timeoutMs / list.length));
  let lastErr = null;
  for (const model of list) {
    try {
      const out = await callModel(model, { systemPrompt, userPrompt, files, timeoutMs: perModelTimeout, maxTokens, temperature });
      return { text: out.text, model, usage: out.usage || null };
    } catch (err) {
      lastErr = err;
      const code = err.statusCode;
      if (code === 401 || code === 403) throw err;
    }
  }
  throw lastErr || new Error('OpenRouter that bai');
}

async function streamModel(model, { systemPrompt, userPrompt, files, timeoutMs, maxTokens, temperature, onDelta }) {
  const key = process.env.OPENROUTER_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let emitted = false;
  let usage = null;
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
          { role: 'user', content: toContent(userPrompt, files) },
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
      const u = obj?.usage;
      if (u) usage = { prompt: u.prompt_tokens || 0, completion: u.completion_tokens || 0 };
    }
    if (!full) throw new Error('OpenRouter tra ve rong');
    return { text: full, model, usage };
  } catch (err) {
    err.emitted = emitted;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function streamAsk({ systemPrompt, userPrompt, files, models, timeoutMs = 60000, maxTokens = 600, temperature = 0.2, onDelta }) {
  if (!process.env.OPENROUTER_API_KEY) {
    const err = new Error('OpenRouter chua cau hinh');
    err.providerFatal = true;
    throw err;
  }
  const list = (models && models.length > 0)
    ? models
    : ((files && files.length > 0) ? visionModelList() : modelList());
  if (list.length === 0) {
    const err = new Error(files && files.length > 0 ? 'OpenRouter chua cau hinh model thi giac' : 'OpenRouter that bai');
    err.providerFatal = true;
    throw err;
  }
  const perModelTimeout = Math.max(15000, Math.floor(timeoutMs / list.length));
  let lastErr = null;
  for (const model of list) {
    try {
      return await streamModel(model, { systemPrompt, userPrompt, files, timeoutMs: perModelTimeout, maxTokens, temperature, onDelta });
    } catch (err) {
      lastErr = err;
      if (err.emitted) throw err;
      const code = err.statusCode;
      if (code === 401 || code === 403) throw err;
    }
  }
  throw lastErr || new Error('OpenRouter that bai');
}

module.exports = { isConfigured, supportsVision, ask, streamAsk, modelList, visionModelList, name: 'openrouter' };
