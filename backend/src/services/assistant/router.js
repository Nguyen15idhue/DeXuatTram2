const providerRegistry = require('./provider');
const configService = require('../assistantConfigService');

const BREAK_MS = 5 * 60 * 1000;
const breakUntil = new Map();

function isOpen(name) {
  const until = breakUntil.get(name);
  if (!until) return false;
  if (until < Date.now()) {
    breakUntil.delete(name);
    return false;
  }
  return true;
}

function trip(name, reason) {
  breakUntil.set(name, Date.now() + BREAK_MS);
  console.warn(`[assistant] provider ${name} tam ngat 5 phut: ${reason}`);
}

function isFatal(err) {
  if (err && err.providerFatal) return true;
  const code = err && err.statusCode;
  return code === 400 || code === 401 || code === 403 || code === 404;
}

async function planProviders(files, only) {
  const base = providerRegistry.available();
  let cfg = null;
  try { cfg = await configService.getConfig(); } catch { cfg = null; }
  const byName = {};
  if (cfg) for (const p of cfg.providers) byName[p.provider] = p;

  if (only && only.length > 0) {
    const wanted = only.filter((n) => providerRegistry.get(n));
    if (wanted.length === 0) {
      const err = new Error(`Provider khong hop le: ${only.join(',')}`);
      err.statusCode = 400;
      throw err;
    }
    const missing = [];
    const list = [];
    for (const name of wanted) {
      const mod = providerRegistry.get(name);
      if (!base.includes(mod)) {
        missing.push(`${name} chua cau hinh key`);
        continue;
      }
      const c = byName[name];
      if (c && !c.enabled) {
        missing.push(`${name} dang tat`);
        continue;
      }
      list.push(mod);
    }
    if (list.length === 0) {
      const err = new Error(missing.join('; ') || 'Khong co provider kha dung');
      err.statusCode = 503;
      throw err;
    }
    return { list, byName };
  }

  let list = base.filter((p) => {
    const c = byName[p.name];
    return !c || c.enabled;
  });
  if (files && files.length > 0) {
    list = list.filter((p) => {
      if (p.name === 'gemini') return true;
      if (p.name === 'openrouter') {
        const c = byName.openrouter;
        const dbVision = c ? c.visionModels : [];
        return dbVision.length > 0 || p.visionModelList().length > 0;
      }
      return typeof p.supportsVision === 'function' && p.supportsVision();
    });
  }
  list.sort((a, b) => {
    const pa = byName[a.name] ? byName[a.name].priority : 10;
    const pb = byName[b.name] ? byName[b.name].priority : 10;
    return pa - pb;
  });
  return { list, byName };
}

function modelsFor(name, byName, files) {
  const c = byName[name];
  if (name === 'gemini') return c && c.models.length > 0 ? c.models : null;
  if (name === 'openrouter') {
    if (files && files.length > 0) return c && c.visionModels.length > 0 ? c.visionModels : null;
    return c && c.models.length > 0 ? c.models : null;
  }
  return null;
}

async function askWithFallback({ systemPrompt, userPrompt, files, maxTokens, temperature, timeoutMs, only }) {
  const { list: providers, byName } = await planProviders(files, only);
  if (providers.length === 0) {
    const err = new Error(files && files.length > 0 ? 'Khong co provider AI ho tro phan tich tep luc nay' : 'Chua cau hinh provider AI');
    err.statusCode = 503;
    throw err;
  }
  const attempts = [];
  for (const provider of providers) {
    if (isOpen(provider.name)) {
      attempts.push({ provider: provider.name, skipped: 'circuit_open' });
      continue;
    }
    const started = Date.now();
    try {
      const result = await provider.ask({ systemPrompt, userPrompt, files, models: modelsFor(provider.name, byName, files), maxTokens, temperature, timeoutMs });
      return {
        text: result.text,
        provider: provider.name,
        model: result.model,
        latencyMs: Date.now() - started,
        fallbackReason: attempts.length > 0 ? JSON.stringify(attempts) : null,
        usage: result.usage || null,
      };
    } catch (err) {
      const fatal = isFatal(err);
      attempts.push({ provider: provider.name, error: err.message, fatal });
      if (!fatal) trip(provider.name, err.message);
    }
  }
  const err = new Error('Tat ca provider AI deu that bai');
  err.statusCode = 503;
  err.attempts = attempts;
  throw err;
}

async function askStreamWithFallback({ systemPrompt, userPrompt, files, maxTokens, temperature, timeoutMs, only, onDelta }) {
  const streamCapable = providerRegistry.available().filter((p) => typeof p.streamAsk === 'function');
  const { list: providers, byName } = await planProviders(files, only);
  const ordered = providers.filter((p) => streamCapable.includes(p));
  if (ordered.length === 0) {
    const err = new Error(files && files.length > 0 ? 'Khong co provider AI ho tro phan tich tep luc nay' : 'Chua cau hinh provider AI');
    err.statusCode = 503;
    throw err;
  }
  const attempts = [];
  for (const provider of ordered) {
    if (isOpen(provider.name)) {
      attempts.push({ provider: provider.name, skipped: 'circuit_open' });
      continue;
    }
    const started = Date.now();
    let emitted = false;
    try {
      const result = await provider.streamAsk({
        systemPrompt,
        userPrompt,
        files,
        models: modelsFor(provider.name, byName, files),
        maxTokens,
        temperature,
        timeoutMs,
        onDelta: (text) => { emitted = true; if (onDelta) onDelta(text); },
      });
      return {
        text: result.text,
        provider: provider.name,
        model: result.model,
        latencyMs: Date.now() - started,
        fallbackReason: attempts.length > 0 ? JSON.stringify(attempts) : null,
        usage: result.usage || null,
      };
    } catch (err) {
      const fatal = isFatal(err);
      attempts.push({ provider: provider.name, error: err.message, fatal });
      if (emitted || err.emitted) throw err;
      if (!fatal) trip(provider.name, err.message);
    }
  }
  const err = new Error('Tat ca provider AI deu that bai');
  err.statusCode = 503;
  err.attempts = attempts;
  throw err;
}

module.exports = { askWithFallback, askStreamWithFallback, isOpen, trip };
