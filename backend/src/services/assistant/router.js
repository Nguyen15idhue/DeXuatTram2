const providerRegistry = require('./provider');

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

async function askWithFallback({ systemPrompt, userPrompt, maxTokens, temperature }) {
  const providers = providerRegistry.available();
  if (providers.length === 0) {
    const err = new Error('Chua cau hinh provider AI');
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
      const result = await provider.ask({ systemPrompt, userPrompt, maxTokens, temperature });
      return {
        text: result.text,
        provider: provider.name,
        model: result.model,
        latencyMs: Date.now() - started,
        fallbackReason: attempts.length > 0 ? JSON.stringify(attempts) : null,
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

module.exports = { askWithFallback, isOpen, trip };
