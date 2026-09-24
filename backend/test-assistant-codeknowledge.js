const router = require('./src/services/assistant/router');
const assistantService = require('./src/services/assistantService');
const codeKnowledgeService = require('./src/services/codeKnowledgeService');
const pool = require('./src/utils/db');

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  check('kill switch mac dinh bat', codeKnowledgeService.enabled() === true);
  check('SUPER duoc dung code knowledge', codeKnowledgeService.canUseCodeKnowledge('SUPER_ADMIN') === true);
  check('ADMIN khong duoc dung', codeKnowledgeService.canUseCodeKnowledge('ADMIN') === false);
  check('SALES khong duoc dung', codeKnowledgeService.canUseCodeKnowledge('SALES') === false);
  check('CTV khong duoc dung', codeKnowledgeService.canUseCodeKnowledge('CTV') === false);
  check('guest khong duoc dung', codeKnowledgeService.canUseCodeKnowledge(null) === false);
  check('guest undefined khong duoc dung', codeKnowledgeService.canUseCodeKnowledge(undefined) === false);

  const st = await codeKnowledgeService.stats();
  check('co chunk code', Number(st.code) > 100, `code=${st.code}`);
  check('co chunk schema', Number(st.schema) > 10, `schema=${st.schema}`);

  const hits = await codeKnowledgeService.search('AssistantChat goi API nao de hoi', 3);
  check('search code co ket qua', hits.length > 0, `hits=${hits.length}`);

  const [vals] = await pool.query("SELECT COUNT(*) AS n FROM assistant_code_knowledge WHERE kind = 'schema' AND content LIKE '%VALUES (%'");
  check('schema khong chua du lieu VALUES', Number(vals[0].n) === 0);

  const [ins] = await pool.query("SELECT COUNT(*) AS n FROM assistant_code_knowledge WHERE kind = 'schema' AND (content LIKE '%@%.%' OR content REGEXP '[0-9]{10,}')");
  check('schema khong chua PII so', Number(ins[0].n) === 0);

  let captured = null;
  router.askWithFallback = async (args) => {
    captured = args;
    return { text: 'stub answer', provider: 'stub', model: 'stub-m', latencyMs: 1, fallbackReason: null };
  };

  captured = null;
  await assistantService.ask('AssistantChat goi API nao de hoi', { id: 1, role: 'SUPER_ADMIN' }, []);
  check('SUPER nhan PHAN 3', !!captured && captured.userPrompt.includes('PHẦN 3'), captured ? `len=${captured.userPrompt.length}` : 'no-capture');

  captured = null;
  await assistantService.ask('AssistantChat goi API nao de hoi', { id: 205, role: 'ADMIN' }, []);
  check('ADMIN khong nhan PHAN 3', !!captured && !captured.userPrompt.includes('PHẦN 3'));

  check('SYSTEM_PROMPT cam dan code', assistantService.SYSTEM_PROMPT.includes('không dán nguyên văn code'));

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
