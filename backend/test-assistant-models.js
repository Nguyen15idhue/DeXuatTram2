const configService = require('./src/services/assistantConfigService');
const pool = require('./src/utils/db');

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  const origFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    const u = String(url);
    if (u.includes('generativelanguage')) {
      return {
        ok: true,
        json: async () => ({ models: [
          { name: 'models/gemini-x', displayName: 'Gemini X', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embed-y', displayName: 'Embed Y', supportedGenerationMethods: ['embedContent'] },
        ] }),
      };
    }
    return {
      ok: true,
      json: async () => ({ data: [
        { id: 'a/b:free', name: 'A B', pricing: { prompt: '0', completion: '0' }, context_length: 1000 },
        { id: 'c/d', name: 'C D', pricing: { prompt: '1', completion: '2' }, context_length: 2000 },
      ] }),
    };
  };

  try {
    try {
      await configService.listModels('Muse', false);
      check('provider la bao 400', false);
    } catch (e) {
      check('provider la bao 400', e.statusCode === 400, `status=${e.statusCode}`);
    }

    await pool.query('DELETE FROM assistant_model_cache');
    fetchCalls = 0;
    const g1 = await configService.listModels('gemini', false);
    check('gemini loc generateContent', g1.models.length === 1 && g1.models[0].id === 'gemini-x', JSON.stringify(g1.models));
    check('gemini khong cache lan dau', g1.cached === false);
    const g2 = await configService.listModels('gemini', false);
    check('gemini cache lan 2', g2.cached === true && fetchCalls === 1, `fetchCalls=${fetchCalls}`);
    const g3 = await configService.listModels('gemini', true);
    check('refresh bo qua cache', g3.cached === false && fetchCalls === 2, `fetchCalls=${fetchCalls}`);

    const o1 = await configService.listModels('openrouter', false);
    check('openrouter 2 model', o1.models.length === 2);
    check('openrouter danh dau free', o1.models[0].free === true && o1.models[1].free === false, JSON.stringify(o1.models.map((m) => m.free)));

    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await configService.listModels('gemini', true);
      check('thieu key bao 503', false);
    } catch (e) {
      check('thieu key bao 503', e.statusCode === 503, `status=${e.statusCode}`);
    } finally {
      if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
    }
  } finally {
    global.fetch = origFetch;
  }

  await configService.listModels('gemini', true);
  await configService.listModels('openrouter', true);
  const [rows] = await pool.query('SELECT provider, JSON_LENGTH(models) AS n FROM assistant_model_cache');
  check('phuc hoi cache that', rows.length === 2 && rows.every((r) => Number(r.n) > 5), JSON.stringify(rows.map((r) => `${r.provider}:${r.n}`)));

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error('FATAL', e.message); try { await pool.end(); } catch { /* silent */ } process.exit(2); });
