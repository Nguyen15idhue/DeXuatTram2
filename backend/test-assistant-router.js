process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENROUTER_API_KEY = 'test-openrouter';
process.env.GEMINI_MODEL = 'gemini-test';
process.env.OPENROUTER_MODEL = 'openrouter-test';

const gemini = require('./src/services/assistant/gemini');
const openrouter = require('./src/services/assistant/openrouter');
const router = require('./src/services/assistant/router');
const assistantService = require('./src/services/assistantService');

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  let geminiCalls = 0;
  let orCalls = 0;

  gemini.ask = async () => { geminiCalls += 1; const e = new Error('RESOURCE_EXHAUSTED'); e.statusCode = 429; throw e; };
  openrouter.ask = async () => { orCalls += 1; return { text: 'Trả lời từ OpenRouter #g01-dang-nhap', model: 'openrouter-test' }; };

  const r1 = await router.askWithFallback({ systemPrompt: 's', userPrompt: 'u' });
  check('fallback sang OpenRouter khi Gemini 429', r1.provider === 'openrouter', r1.provider);
  check('OpenRouter duoc goi 1 lan', orCalls === 1, String(orCalls));
  check('fallbackReason ghi ly do', !!r1.fallbackReason && r1.fallbackReason.includes('RESOURCE_EXHAUSTED'));

  const r2 = await router.askWithFallback({ systemPrompt: 's', userPrompt: 'u' });
  check('circuit breaker ngat Gemini lan 2', r2.provider === 'openrouter' && geminiCalls === 1, `geminiCalls=${geminiCalls}`);

  check('redact so dien thoai', assistantService.redactPII('Goi 0912345678 nhe') === 'Goi [số điện thoại đã ẩn] nhe');
  check('redact email', assistantService.redactPII('gui a@b.com') === 'gui [email đã ẩn]');
  check('stripHtml', assistantService.stripHtml('<p>Xin <b>chao</b></p>') === 'Xin chao');

  router.trip('openrouter', 'test-reset');
  check('isOpen sau khi trip', router.isOpen('openrouter') === true);

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
