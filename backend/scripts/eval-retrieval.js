const pool = require('../src/utils/db');
const helpService = require('../src/services/helpService');
const assistantService = require('../src/services/assistantService');
const dataTools = require('../src/services/assistant/dataTools');
const guard = require('../src/services/assistant/guard');
const { CASES } = require('./eval-assistant-100');

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

function stripHtml(html) {
  return assistantService.stripHtml(html);
}

async function main() {
  const only = String(process.env.EVAL_ONLY || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= CASES.length);
  const onlySet = only.length > 0 ? new Set(only) : null;

  for (let i = 0; i < CASES.length; i += 1) {
    if (onlySet && !onlySet.has(i + 1)) continue;
    const c = CASES[i];
    const label = `#${i + 1} [${c.cat}] ${c.q}`;
    const role = c.user === 'guest' ? null : (c.user === 'ctv' ? 'CTV' : 'SUPER_ADMIN');
    const user = role ? { role } : null;
    try {
      const g = guard.classify(c.q);
      if (c.type === 'refuse') {
        check(label, g.scope === 'out', g.scope);
        continue;
      }
      if (c.type === 'deny') {
        const r = await dataTools.lookup(c.q, user);
        check(label, !!(r && r.deny), r ? (r.deny ? 'deny' : `tool=${r.tool}`) : 'no-tool');
        continue;
      }
      if (c.type === 'noleak') {
        const r = await dataTools.lookup(c.q, user);
        const blocked = g.scope === 'forbidden' || !!(r && (r.deny || r.error));
        check(label, blocked, `guard=${g.scope} tool=${r ? r.tool : '-'}`);
        continue;
      }
      const dataResult = await dataTools.lookup(c.q, user);
      if (dataResult && (dataResult.deny || dataResult.error)) {
        check(label, false, `unexpected ${dataResult.deny ? 'deny' : 'error'} tool=${dataResult.tool}`);
        continue;
      }
      const skipDocs = !!(dataResult && dataResult.skipDocs);
      const articles = skipDocs ? [] : await helpService.searchForAssistant(c.q, role, 5);
      const texts = [
        dataResult ? dataResult.text : '',
        ...articles.map((a) => `${a.title}\n${a.summary || ''}\n${stripHtml(a.content_html)}`),
      ].join('\n');
      const kw = c.re ? c.re.test(texts) : true;
      let src = true;
      let srcInfo = '';
      if (c.slugs) {
        const got = articles.map((a) => a.slug);
        src = c.slugs.some((s) => got.includes(s));
        srcInfo = `got=${got.join(',')}`;
      }
      const toolInfo = dataResult ? `tool=${dataResult.tool}` : 'tool=-';
      check(label, kw && src, `${kw ? '' : 'thieu-tukhoa '}${src ? '' : 'sai-nguon '}${srcInfo} ${toolInfo}`.trim());
    } catch (e) {
      check(label, false, `ERROR ${e.message}`);
    }
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  await pool.end();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error('FATAL', e.message); try { await pool.end(); } catch { /* silent */ } process.exit(2); });
