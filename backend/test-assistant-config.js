const configService = require('./src/services/assistantConfigService');
const router = require('./src/services/assistant/router');
const assistantService = require('./src/services/assistantService');
const pool = require('./src/utils/db');

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function expect400(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(name, e.statusCode === 400, e.statusCode ? `status=${e.statusCode}` : e.message);
    return;
  }
  check(name, false, 'khong throw');
}

async function main() {
  const okPayload = {
    providers: [
      { provider: 'gemini', enabled: true, models: ['gemini-2.5-flash', ' gemini-2.5-flash ', ''], priority: 1 },
      { provider: 'openrouter', enabled: false, models: [], visionModels: [], priority: 2 },
    ],
  };
  const cleaned = configService.validatePayload(okPayload);
  check('validate hop le', cleaned.length === 2 && cleaned[0].models.length === 1 && cleaned[0].models[0] === 'gemini-2.5-flash');
  await expect400('provider la', () => configService.validatePayload({ providers: [{ provider: 'Muse', enabled: true, priority: 1 }] }));
  await expect400('trung priority', () => configService.validatePayload({ providers: [{ provider: 'gemini', enabled: true, priority: 1 }, { provider: 'openrouter', enabled: true, priority: 1 }] }));
  await expect400('priority 0', () => configService.validatePayload({ providers: [{ provider: 'gemini', enabled: true, priority: 0 }] }));
  await expect400('priority chuoi', () => configService.validatePayload({ providers: [{ provider: 'gemini', enabled: true, priority: 'x' }] }));
  await expect400('thieu providers', () => configService.validatePayload({}));
  await expect400('providers rong', () => configService.validatePayload({ providers: [] }));

  const cfg = await configService.getConfig();
  check('config 2 provider', cfg.providers.length === 2, cfg.providers.map((p) => p.provider).join(','));
  check('sap xep theo priority', cfg.providers[0].priority <= cfg.providers[1].priority);
  check('khong lo key', JSON.stringify(cfg).includes('AIza') === false && !('apiKey' in (cfg.providers[0] || {})));
  check('co keyConfigured', cfg.providers.every((p) => typeof p.keyConfigured === 'boolean'));
  check('effectiveModels fallback env', cfg.providers.every((p) => Array.isArray(p.effectiveModels) && p.effectiveModels.length > 0));

  const saved = await configService.saveConfig({
    providers: [
      { provider: 'gemini', enabled: true, models: ['test-model-a'], priority: 2 },
      { provider: 'openrouter', enabled: true, models: ['t/m:free'], visionModels: ['v/m:free'], priority: 1 },
    ],
  });
  check('save doi thu tu', saved.providers[0].provider === 'openrouter', saved.providers.map((p) => p.provider).join('>'));
  check('save luu models', saved.providers[1].models[0] === 'test-model-a');
  const [rows] = await pool.query('SELECT provider, models FROM assistant_provider_configs WHERE provider = ?', ['gemini']);
  check('models trong DB', String(rows[0].models).includes('test-model-a'));
  await configService.saveConfig({
    providers: [
      { provider: 'gemini', enabled: true, models: [], priority: 1 },
      { provider: 'openrouter', enabled: true, models: [], visionModels: [], priority: 2 },
    ],
  });
  const restored = await configService.getConfig();
  check('restore mac dinh', restored.providers[0].provider === 'gemini' && restored.providers[0].models.length === 0);

  let onlySeen = null;
  const origAsk = router.askWithFallback;
  router.askWithFallback = async (args) => {
    onlySeen = args.only || null;
    return { text: 'stub', provider: 'gemini', model: 'm', latencyMs: 1, fallbackReason: null, usage: null };
  };
  const [logBefore] = await pool.query('SELECT COUNT(*) AS n FROM assistant_logs');
  await assistantService.ask('AssistantChat goi API nao de hoi', { id: 1, role: 'SUPER_ADMIN' }, [], { onlyProviders: ['gemini'], testMode: true });
  const [logAfter] = await pool.query('SELECT COUNT(*) AS n FROM assistant_logs');
  check('only truyen xuong router', Array.isArray(onlySeen) && onlySeen[0] === 'gemini', JSON.stringify(onlySeen));
  check('testMode khong ghi log', Number(logAfter[0].n) === Number(logBefore[0].n), `${logBefore[0].n}->${logAfter[0].n}`);
  router.askWithFallback = origAsk;

  try {
    await router.askWithFallback({ systemPrompt: 's', userPrompt: 'u', only: ['khong-co'] });
    check('only sai bao 400', false);
  } catch (e) {
    check('only sai bao 400', e.statusCode === 400, `status=${e.statusCode}`);
  }

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error('FATAL', e.message); try { await pool.end(); } catch { /* silent */ } process.exit(2); });
