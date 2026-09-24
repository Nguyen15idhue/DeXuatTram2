const crypto = require('crypto');
const pool = require('../utils/db');
const ttlCache = require('../utils/ttlCache');
const helpService = require('./helpService');
const knowledgeService = require('./knowledgeService');
const codeKnowledgeService = require('./codeKnowledgeService');
const dataTools = require('./assistant/dataTools');
const attachments = require('./assistant/attachments');
const guard = require('./assistant/guard');
const router = require('./assistant/router');
const providerRegistry = require('./assistant/provider');

const CACHE_TTL_MS = 60 * 60 * 1000;
const TOP_N = 5;
const HISTORY_TURNS = 10;
const HISTORY_ITEM_CHARS = 800;
const SNIPPET_CHARS = 1600;
const MAX_QUESTION_CHARS = 500;

const REFERENTIAL_RE = /\b(no|nay|do|ay|kia|vay|the|tren|duoi|con|luc do|sau do|tiep theo|cai do|truong hop do|nguoi do|viec do)\b/;

const SYSTEM_PROMPT = [
  'Bạn là trợ lý hướng dẫn sử dụng của hệ thống Quản lý Trạm. Trả lời bằng tiếng Việt.',
  'Nguyên tắc bắt buộc:',
  '1. TRẢ LỜI TRỰC TIẾP câu hỏi ngay câu đầu, đúng trọng tâm, không dẫn dắt vòng vo. Chỉ trả lời bằng tiếng Việt; KHÔNG viết lời dẫn/suy luận/ghi chú quá trình và KHÔNG nhắc nhãn ngữ cảnh (A1, PHẦN 1, "We need to...").',
  '2. ĐẦY ĐỦ nhưng có chọn lọc: bổ sung các khía cạnh liên quan mà tài liệu có (ai làm · khi nào · kết quả/trạng thái · bước tiếp theo · ngoại lệ). KHÔNG đưa nội dung người dùng không hỏi. Nếu người dùng nêu rõ mô hình/đối tượng (TDT/Tự đầu tư, NQ, LK, NQ_LK, trạm, user...), CHỈ trả lời đúng phạm vi đó — KHÔNG liệt kê mô hình/trường hợp khác.',
  '3. DIỄN ĐẠT LẠI tự nhiên như trợ lý, KHÔNG sao chép nguyên văn cả bài; giữ đúng thuật ngữ hệ thống (tên trạng thái, tên trường, route). KHÔNG nêu số lượng trường, mã trường kỹ thuật (key) hay cấu trúc layout nội bộ.',
  '4. CHỈ dùng thông tin trong tài liệu được cung cấp; khi prompt ghi rõ KHÔNG có tài liệu phù hợp thì trả lời dựa trên hiểu biết chung về hệ thống Quản lý Trạm và nói rõ mức chắc chắn. Tuyệt đối không bịa.',
  '5. Chỉ được dùng DỮ LIỆU THẬT khi nó xuất hiện ở PHẦN 0. KHÔNG tự bịa con số/danh sách; KHÔNG tiết lộ dữ liệu vận hành (người dùng, trạm, đề xuất, danh mục dữ liệu, tệp, nhật ký). Nếu không có dữ liệu, nói rõ là không có và chỉ dẫn xem ở trang quản trị tương ứng.',
  '6. Độ dài tương xứng câu hỏi: hỏi một dữ kiện thì 2-4 câu; hỏi quy trình thì mới liệt kê bước + lưu ý + lỗi thường gặp.',
  'Dùng markdown: ## cho mục, **đậm** cho từ khoá, "-" hoặc "1." cho danh sách, `code` cho route/tên trường.',
  'Chỉ ghi nguồn MỘT LẦN ở dòng cuối dạng "Nguồn: #slug1, #slug2" (chỉ với bài ở PHẦN 1), không lặp nguồn mỗi dòng. KHÔNG nhắc tới tài liệu nội bộ, tên file hay đường dẫn kỹ thuật.',
  'Không tiết lộ thông tin cá nhân (số điện thoại, email, tên chủ trạm) và không bịa dữ liệu đề xuất/trạm cụ thể.',
  'Chỉ trả lời các vấn đề thuộc hệ thống Quản lý Trạm; câu ngoài phạm vi (so sánh AI khác, kiến thức đời thường, lập trình không liên quan...) thì từ chối ngắn gọn 1-2 câu và gợi ý hỏi về hệ thống.',
  'Với PHẦN 3 (mã nguồn/schema, chỉ SUPER_ADMIN): diễn giải bằng lời của bạn, TUYỆT ĐỐI không dán nguyên văn code, không nêu đường dẫn file, tên hàm/biến nội bộ chi tiết hay secret; chỉ nêu tên API/route khi người dùng hỏi kỹ thuật và cần thiết.',
  'Khi có PHẦN TỆP ĐÍNH KÈM: trả lời dựa trên nội dung tệp kết hợp kiến thức hệ thống; nếu tệp không liên quan hệ thống thì từ chối ngắn gọn.',
  'Ví dụ câu hỏi dữ kiện "Duyệt xong đề xuất có thành trạm luôn không?" → trả lời: "Không. Duyệt nghĩa là hồ sơ đạt và hệ thống tự tạo lệnh đẩy sang 1Office, đề xuất **chưa** thành trạm thật. Trạm thật được tạo riêng ở Quản lý Trạm hoặc nút \'Tạo trạm nhanh\' trên bản đồ. Nguồn: #q01-duyet-xong-sao-de-xuat-chua-thanh-tram"',
].join(' ');

function decodeEntities(str) {
  return String(str)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ');
}

function htmlToStructuredText(html) {
  let out = String(html || '');
  out = out.replace(/<h[12][^>]*>/gi, '\n## ').replace(/<\/h[12]>/gi, '\n');
  out = out.replace(/<h[3-6][^>]*>/gi, '\n### ').replace(/<\/h[3-6]>/gi, '\n');
  out = out.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');
  out = out.replace(/<tr[^>]*>/gi, '\n| ').replace(/<\/(td|th)>/gi, ' | ');
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<\/(p|div|ul|ol|table|blockquote)>/gi, '\n');
  out = out.replace(/<(strong|b)[^>]*>/gi, '**').replace(/<\/(strong|b)>/gi, '**');
  out = out.replace(/<(em|i)[^>]*>/gi, '*').replace(/<\/(em|i)>/gi, '*');
  out = out.replace(/<[^>]+>/g, ' ');
  out = decodeEntities(out);
  out = out.replace(/[ \t]+/g, ' ');
  out = out.replace(/\n\s*\n\s*\n+/g, '\n\n');
  return out.trim();
}

function stripHtml(html) {
  return htmlToStructuredText(html).replace(/[#*|\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function redactPII(text) {
  return String(text || '')
    .replace(/(\+?84|0)\d{9,10}/g, '[số điện thoại đã ẩn]')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email đã ẩn]');
}

function isEnabled() {
  const flag = process.env.ASSISTANT_ENABLED;
  if (flag === 'false') return false;
  return providerRegistry.available().length > 0;
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item.role === 'assistant' || item.role === 'bot') ? 'assistant' : 'user';
    const rawText = item.content !== undefined ? item.content : item.text;
    const content = String(rawText == null ? '' : rawText).trim().slice(0, HISTORY_ITEM_CHARS);
    if (!content) continue;
    out.push({ role, content });
  }
  return out.slice(-HISTORY_TURNS * 2);
}

function splitSections(structuredText) {
  const lines = String(structuredText || '').split('\n');
  const sections = [];
  let cur = { heading: '', body: [] };
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{2,3}\s+/.test(trimmed)) {
      if (cur.heading || cur.body.length > 0) sections.push(cur);
      cur = { heading: trimmed.replace(/^#+\s*/, ''), body: [] };
    } else {
      cur.body.push(line);
    }
  }
  if (cur.heading || cur.body.length > 0) sections.push(cur);
  return sections
    .map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }))
    .filter((s) => s.heading || s.body);
}

function selectSections(structuredText, tokens, budget) {
  const text = String(structuredText || '');
  const sections = splitSections(text);
  if (sections.length <= 1 && !sections[0]?.heading) return text.slice(0, budget);

  const scored = sections.map((s) => {
    const hay = helpService.normalizeText(`${s.heading} ${s.body}`);
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 1;
    return { s, score };
  });
  const relevant = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const picked = relevant.length > 0 ? relevant : scored;

  const out = [];
  let used = 0;
  for (const { s } of picked) {
    const block = (s.heading ? `## ${s.heading}\n` : '') + s.body;
    if (out.length > 0 && used + block.length > budget) continue;
    out.push(block);
    used += block.length;
    if (used >= budget) break;
  }
  return out.join('\n\n').slice(0, budget);
}

function detectIntent(question) {
  const q = helpService.normalizeText(question);
  if (/(trang thai gi|la gi|khi nao|bao lau|ai |bao nhieu|tai sao|vi sao|o dau|co phai|dung khong|co khong)/.test(q)) return 'factual';
  if (/(cach |lam sao|lam the nao|quy trinh|cac buoc|huong dan|thu tuc|the nao)/.test(q)) return 'howto';
  return 'balanced';
}

function tokenBudgetFor(intent) {
  if (intent === 'factual') return 320;
  if (intent === 'howto') return 800;
  return 560;
}

function shouldRewrite(question, history) {
  if (!history || history.length === 0) return false;
  if (question.length <= 40) return true;
  return REFERENTIAL_RE.test(helpService.normalizeText(question));
}

async function rewriteQuestion(question, history) {
  if (!shouldRewrite(question, history)) return question;
  const transcript = history.slice(-6)
    .map((h) => `${h.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${h.content}`)
    .join('\n');
  const systemPrompt = 'Bạn viết lại câu hỏi nối tiếp của người dùng thành MỘT câu hỏi độc lập, đầy đủ ngữ cảnh, giữ nguyên thuật ngữ chuyên ngành. Chỉ trả về đúng câu hỏi đã viết lại, không giải thích, không thêm dấu ngoặc kép.';
  const userPrompt = `HỘI THOẠI TRƯỚC:\n${transcript}\n\nCÂU HỎI NỐI TIẾP: ${question}\n\nCâu hỏi độc lập:`;
  try {
    const res = await router.askWithFallback({ systemPrompt, userPrompt, maxTokens: 120, temperature: 0 });
    const out = String(res.text || '').replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].trim();
    return out.length >= 3 && out.length <= 300 ? out : question;
  } catch {
    return question;
  }
}

async function articlesVersion() {
  const key = 'assistant:articles-version';
  const hit = ttlCache.get(key);
  if (hit) return hit;
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '1970-01-01') AS v FROM help_articles WHERE status = 'published'"
  );
  const v = `${rows[0].n}:${new Date(rows[0].v).getTime()}`;
  ttlCache.set(key, v, 60 * 1000);
  return v;
}

async function knowledgeVersion() {
  const key = 'assistant:knowledge-version';
  const hit = ttlCache.get(key);
  if (hit) return hit;
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '1970-01-01') AS v FROM assistant_knowledge"
  );
  const v = `${rows[0].n}:${new Date(rows[0].v).getTime()}`;
  ttlCache.set(key, v, 60 * 1000);
  return v;
}

const structuredCache = new Map();

function cachedStructured(article) {
  const key = `${article.id}:${article.updated_at}`;
  const hit = structuredCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = htmlToStructuredText(article.content_html);
  if (structuredCache.size > 200) structuredCache.clear();
  structuredCache.set(key, { value, exp: Date.now() + 10 * 60 * 1000 });
  return value;
}

async function retrieve(question, role) {
  return helpService.searchForAssistant(question, role, TOP_N);
}

function filterArticlesByModel(articles, model) {
  if (!model || model === 'NQ_LK') return articles;
  return articles.filter((a) => {
    const hay = helpService.normalizeText([a.slug, a.title, ...(Array.isArray(a.tags) ? a.tags : [])].join(' '));
    return !/(nq_lk|nq-lk|nhuong quyen.*lien ket)/.test(hay);
  });
}

function buildUserPrompt({ question, articles, knowledge, codeChunks, history, tokens, dataContext, noSources, attachText }) {
  const blocks = [];

  if (dataContext) {
    blocks.push('PHẦN 0 — DỮ LIỆU THẬT (truy vấn trực tiếp từ hệ thống, hãy dùng đúng dữ liệu này):');
    blocks.push(dataContext);
    blocks.push('');
  }

  blocks.push('PHẦN 1 — BÀI HƯỚNG DẪN CHÍNH THỨC (ưu tiên trả lời từ đây):');
  if (articles.length === 0) blocks.push('(không có bài phù hợp)');
  blocks.push(...articles.map((a, i) => {
    const body = selectSections(cachedStructured(a), tokens, SNIPPET_CHARS);
    return `[A${i + 1}] #${a.slug} — ${a.title}\n${body}`;
  }));

  const articleTitles = new Set(articles.map((a) => helpService.normalizeText(a.title)));
  const dedupedKnowledge = (knowledge || []).filter((k) => !articleTitles.has(helpService.normalizeText(k.heading)));
  if (dedupedKnowledge.length > 0) {
    blocks.push('', 'PHẦN 2 — TÀI LIỆU KỸ THUẬT NỘI BỘ (chỉ để bổ sung chi tiết khi Phần 1 thiếu). TUYỆT ĐỐI không nêu tên file/đường dẫn/tài liệu nội bộ cho người dùng; nếu nội dung trùng với bài ở PHẦN 1 thì ghi nguồn theo bài đó:');
    blocks.push(...dedupedKnowledge.map((k, i) => `[K${i + 1}] ${k.heading}\n${selectSections(k.content, tokens, SNIPPET_CHARS)}`));
  }

  if (codeChunks && codeChunks.length > 0) {
    blocks.push('', 'PHẦN 3 — MÃ NGUỒN VÀ CẤU TRÚC DB (chỉ SUPER_ADMIN được xem; diễn giải bằng lời, KHÔNG dán code/đường dẫn/secret):');
    blocks.push(...codeChunks.map((k, i) => `[C${i + 1}] ${k.heading}\n${selectSections(k.content, tokens, SNIPPET_CHARS)}`));
  }

  if (attachText) {
    blocks.push('', 'PHẦN TỆP ĐÍNH KÈM (nội dung người dùng gửi; ảnh đã đính kèm riêng để xem trực tiếp):');
    blocks.push(attachText);
  }

  if (history && history.length > 0) {
    blocks.push('', 'HỘI THOẠI TRƯỚC (chỉ để hiểu ngữ cảnh, không trả lời lại nội dung này):');
    blocks.push(...history.map((h) => `${h.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${h.content}`));
  }

  blocks.push('', 'CÂU HỎI NGƯỜI DÙNG:', question, '');
  blocks.push('Hãy trả lời trực tiếp và đầy đủ. Nếu là câu hỏi nối tiếp, dùng HỘI THOẠI TRƯỚC để hiểu ngữ cảnh nhưng KHÔNG đổi sang chủ đề khác.');
  if (dataContext) {
    blocks.push('Câu hỏi này có DỮ LIỆU THẬT ở PHẦN 0: trả lời gọn theo dữ liệu đó, giữ nguyên các nhãn như "(bắt buộc)" nếu có; nếu vẫn có bài ở PHẦN 1 thì ghi nguồn, nếu không có bài thì KHÔNG ghi dòng "Nguồn:".');
  } else if (noSources) {
    blocks.push('KHÔNG có bài/tài liệu phù hợp: hãy trả lời dựa trên hiểu biết chung về hệ thống Quản lý Trạm; nếu không chắc chắn thì nói rõ là không chắc và gợi ý xem trang Hướng dẫn; KHÔNG ghi dòng "Nguồn:".');
  } else {
    blocks.push('Ghi nguồn 1 lần ở dòng cuối dạng "Nguồn: #slug" (chỉ với bài ở PHẦN 1).');
  }
  return blocks.join('\n');
}

function truncate(value, max) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

async function log({ question, answer, sources, provider, latencyMs, fallbackReason, userId, tool, hasAttachment, attachmentTypes, promptTokens, completionTokens, cached }) {
  try {
    await pool.query(
      'INSERT INTO assistant_logs (question, answer, sources, provider, latency_ms, fallback_reason, user_id, tool, has_attachment, attachment_types, prompt_tokens, completion_tokens, cached) VALUES (?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [truncate(question, 500), answer || null, JSON.stringify(sources || []), truncate(provider, 20), latencyMs || null, truncate(fallbackReason, 255), userId || null, truncate(tool, 64), hasAttachment ? 1 : 0, truncate(attachmentTypes, 255), promptTokens || null, completionTokens || null, cached ? 1 : 0]
    );
  } catch (err) {
    console.error('[assistant] log error:', err.message);
  }
}

function toSource(a) {
  const images = Array.isArray(a.images)
    ? a.images.map((im) => (typeof im === 'string' ? im : im && im.url)).filter(Boolean)
    : [];
  return {
    slug: a.slug,
    title: a.title,
    id: a.legacy_id || a.slug,
    category: a.category_slug || null,
    images: images.slice(0, 3),
    route: a.route || null,
  };
}

function hashKey(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

async function ask(question, user, rawHistory, options) {
  const q = String(question || '').trim().slice(0, MAX_QUESTION_CHARS);
  if (q.length < 2) {
    const err = new Error('Câu hỏi quá ngắn');
    err.statusCode = 400;
    throw err;
  }
  if (!isEnabled()) {
    const err = new Error('Chatbot chưa được cấu hình');
    err.statusCode = 503;
    throw err;
  }

  const guardResult = guard.classify(q);
  if (guardResult.scope !== guard.SCOPE_IN) {
    const reason = guardResult.scope === guard.SCOPE_FORBIDDEN ? 'guard_forbidden' : 'guard_out';
    const result = {
      answer: guard.refusalText(guardResult.scope),
      sources: [],
      knowledge: [],
      provider: null,
      latencyMs: 0,
      fallbackReason: reason,
    };
    await doLog({ question: q, answer: result.answer, sources: [], provider: null, latencyMs: 0, fallbackReason: reason, userId: user?.id });
    return result;
  }

  const uploadFiles = (options && options.files) || [];
  const attach = uploadFiles.length > 0 ? await attachments.processFiles(uploadFiles) : null;
  const only = (options && options.onlyProviders) || null;
  const testMode = !!(options && options.testMode);
  const useCache = !attach && !testMode;
  const doLog = testMode ? async () => {} : log;

  const role = user ? user.role : null;
  const history = sanitizeHistory(rawHistory);
  const historyKey = history.map((h) => `${h.role[0]}:${h.content}`).join('|').slice(0, 1200);

  const version = await articlesVersion();
  const knowledgeV = await knowledgeVersion();
  const cacheKey = `assistant:${hashKey(`${q}|${role || 'guest'}|${version}|${knowledgeV}|${historyKey}`)}`;
  if (useCache) {
    const cached = ttlCache.get(cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  const rewritten = await rewriteQuestion(q, history);
  const rewriteKey = `assistant:${hashKey(`${rewritten}|${role || 'guest'}|${version}|${knowledgeV}`)}`;
  if (useCache) {
    const cachedRewrite = ttlCache.get(rewriteKey);
    if (cachedRewrite) {
      ttlCache.set(cacheKey, cachedRewrite, CACHE_TTL_MS);
      return { ...cachedRewrite, cached: true };
    }
  }
  const storeResult = (result) => {
    if (!useCache) return;
    ttlCache.set(cacheKey, result, CACHE_TTL_MS);
    ttlCache.set(rewriteKey, result, CACHE_TTL_MS);
  };

  const dataResult = await dataTools.lookup(rewritten, user);
  const dataContext = dataResult ? dataResult.text : null;

  if (dataResult && dataResult.direct) {
    const result = {
      answer: redactPII(dataResult.text),
      sources: [],
      knowledge: [],
      provider: null,
      latencyMs: 0,
      fallbackReason: `tool_direct:${dataResult.tool || 'unknown'}`,
      tool: dataResult.tool || null,
    };
    storeResult(result);
    await doLog({ question: q, answer: result.answer, sources: [], provider: null, latencyMs: 0, fallbackReason: result.fallbackReason, userId: user?.id, tool: dataResult.tool || null });
    return result;
  }

  if (dataResult && (dataResult.deny || dataResult.error)) {
    const result = {
      answer: dataResult.text,
      sources: [],
      knowledge: [],
      provider: null,
      latencyMs: 0,
      fallbackReason: dataResult.deny ? 'data_denied' : 'data_error',
      tool: dataResult.tool || null,
    };
    storeResult(result);
    await doLog({ question: q, answer: result.answer, sources: [], provider: null, latencyMs: 0, fallbackReason: result.fallbackReason, userId: user?.id, tool: dataResult.tool || null });
    return result;
  }

  const tokens = helpService.tokenize(rewritten).slice(0, 8);
  const skipDocs = !!(dataResult && dataResult.skipDocs);
  const model = dataTools.detectModel(helpService.normalizeText(rewritten));
  const articles = skipDocs ? [] : filterArticlesByModel(await retrieve(rewritten, role), model);
  const knowledge = dataResult ? [] : (knowledgeService.canUseKnowledge(role) ? await knowledgeService.search(rewritten, 3) : []);
  const codeChunks = dataResult ? [] : (codeKnowledgeService.canUseCodeKnowledge(role) ? await codeKnowledgeService.search(rewritten, 3) : []);
  const sources = articles.map(toSource);

  const noSources = articles.length === 0 && knowledge.length === 0 && codeChunks.length === 0 && !dataContext;

  const intent = detectIntent(rewritten);
  const maxTokens = tokenBudgetFor(intent);

  try {
    const res = await router.askWithFallback({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt({ question: q, articles, knowledge, codeChunks, history, tokens, dataContext, noSources, attachText: attach ? (attach.docText || `(người dùng đính kèm ${attach.inlines.length} ảnh, hãy xem trực tiếp)`) : null }),
      files: attach ? attach.inlines : null,
      maxTokens,
      temperature: 0.2,
      timeoutMs: attach ? 60000 : undefined,
      only,
    });
    const result = {
      answer: redactPII(res.text),
      sources,
      knowledge: [],
      provider: res.provider,
      model: res.model,
      latencyMs: res.latencyMs,
      fallbackReason: res.fallbackReason,
      tool: (dataResult && dataResult.tool) || null,
    };
    storeResult(result);
    await doLog({ question: q, answer: result.answer, sources, provider: res.provider, latencyMs: res.latencyMs, fallbackReason: res.fallbackReason, userId: user?.id, tool: result.tool, promptTokens: res.usage?.prompt, completionTokens: res.usage?.completion, hasAttachment: !!attach, attachmentTypes: attach ? attach.types.join(',') : null });
    return result;
  } catch (err) {
    if (dataContext) {
      const result = {
        answer: dataContext,
        sources: [],
        knowledge: [],
        provider: null,
        latencyMs: 0,
        fallbackReason: JSON.stringify(err.attempts || err.message),
      };
      storeResult(result);
      await doLog({ question: q, answer: result.answer, sources: [], provider: null, latencyMs: 0, fallbackReason: result.fallbackReason, userId: user?.id });
      return result;
    }
    const result = {
      answer: 'Hệ thống trả lời đang tạm quá tải. Bạn thử lại sau ít phút, hoặc xem trực tiếp các bài liên quan bên dưới.',
      sources,
      knowledge: [],
      provider: null,
      latencyMs: 0,
      fallbackReason: JSON.stringify(err.attempts || err.message),
    };
    await doLog({ question: q, answer: result.answer, sources, provider: null, latencyMs: 0, fallbackReason: result.fallbackReason, userId: user?.id });
    return result;
  }
}

async function askStream(question, user, rawHistory, onDelta, onStatus, options) {
  const q = String(question || '').trim().slice(0, MAX_QUESTION_CHARS);
  if (q.length < 2) {
    const err = new Error('Câu hỏi quá ngắn');
    err.statusCode = 400;
    throw err;
  }
  if (!isEnabled()) {
    const err = new Error('Chatbot chưa được cấu hình');
    err.statusCode = 503;
    throw err;
  }

  const guardResult = guard.classify(q);

  const status = (stage, message) => { if (onStatus) onStatus({ stage, message }); };
  status('search', 'Đang tìm tài liệu liên quan...');
  let anyEmitted = false;
  let acc = '';
  const emit = (text) => {
    if (!text) return;
    anyEmitted = true;
    const redacted = redactPII(text);
    acc += redacted;
    if (onDelta) onDelta(redacted);
  };

  if (guardResult.scope !== guard.SCOPE_IN) {
    const reason = guardResult.scope === guard.SCOPE_FORBIDDEN ? 'guard_forbidden' : 'guard_out';
    const result = { answer: guard.refusalText(guardResult.scope), sources: [], knowledge: [], provider: null, latencyMs: 0, fallbackReason: reason };
    await doLog({ question: q, answer: result.answer, sources: [], provider: null, latencyMs: 0, fallbackReason: reason, userId: user?.id });
    emit(result.answer);
    return result;
  }

  const uploadFiles = (options && options.files) || [];
  const attach = uploadFiles.length > 0 ? await attachments.processFiles(uploadFiles) : null;
  const only = (options && options.onlyProviders) || null;
  const testMode = !!(options && options.testMode);
  const useCache = !attach && !testMode;
  const doLog = testMode ? async () => {} : log;

  const role = user ? user.role : null;
  const history = sanitizeHistory(rawHistory);
  const historyKey = history.map((h) => `${h.role[0]}:${h.content}`).join('|').slice(0, 1200);

  const version = await articlesVersion();
  const knowledgeV = await knowledgeVersion();
  const cacheKey = `assistant:${hashKey(`${q}|${role || 'guest'}|${version}|${knowledgeV}|${historyKey}`)}`;
  const cached = useCache ? ttlCache.get(cacheKey) : null;
  if (cached) { emit(cached.answer); return { ...cached, cached: true }; }

  const rewritten = await rewriteQuestion(q, history);
  const rewriteKey = `assistant:${hashKey(`${rewritten}|${role || 'guest'}|${version}|${knowledgeV}`)}`;
  if (useCache) {
    const cachedRewrite = ttlCache.get(rewriteKey);
    if (cachedRewrite) {
      ttlCache.set(cacheKey, cachedRewrite, CACHE_TTL_MS);
      emit(cachedRewrite.answer);
      return { ...cachedRewrite, cached: true };
    }
  }
  const storeResult = (result) => {
    if (!useCache) return;
    ttlCache.set(cacheKey, result, CACHE_TTL_MS);
    ttlCache.set(rewriteKey, result, CACHE_TTL_MS);
  };

  const dataResult = await dataTools.lookup(rewritten, user);
  const dataContext = dataResult ? dataResult.text : null;

  if (dataResult && dataResult.direct) {
    const result = {
      answer: redactPII(dataResult.text),
      sources: [],
      knowledge: [],
      provider: null,
      latencyMs: 0,
      fallbackReason: `tool_direct:${dataResult.tool || 'unknown'}`,
      tool: dataResult.tool || null,
    };
    storeResult(result);
    await doLog({ question: q, answer: result.answer, sources: [], provider: null, latencyMs: 0, fallbackReason: result.fallbackReason, userId: user?.id, tool: dataResult.tool || null });
    emit(result.answer);
    return result;
  }

  if (dataResult && (dataResult.deny || dataResult.error)) {
    const result = { answer: dataResult.text, sources: [], knowledge: [], provider: null, latencyMs: 0, fallbackReason: dataResult.deny ? 'data_denied' : 'data_error', tool: dataResult.tool || null };
    storeResult(result);
    await doLog({ question: q, answer: result.answer, sources: [], provider: null, latencyMs: 0, fallbackReason: result.fallbackReason, userId: user?.id, tool: dataResult.tool || null });
    emit(result.answer);
    return result;
  }

  const tokens = helpService.tokenize(rewritten).slice(0, 8);
  const skipDocs = !!(dataResult && dataResult.skipDocs);
  const model = dataTools.detectModel(helpService.normalizeText(rewritten));
  const articles = skipDocs ? [] : filterArticlesByModel(await retrieve(rewritten, role), model);
  const knowledge = dataResult ? [] : (knowledgeService.canUseKnowledge(role) ? await knowledgeService.search(rewritten, 3) : []);
  const codeChunks = dataResult ? [] : (codeKnowledgeService.canUseCodeKnowledge(role) ? await codeKnowledgeService.search(rewritten, 3) : []);
  const sources = articles.map(toSource);

  const noSources = articles.length === 0 && knowledge.length === 0 && codeChunks.length === 0 && !dataContext;

  const intent = detectIntent(rewritten);
  const maxTokens = tokenBudgetFor(intent);
  status('think', 'Đang tổng hợp câu trả lời...');

  try {
    const res = await router.askStreamWithFallback({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt({ question: q, articles, knowledge, codeChunks, history, tokens, dataContext, noSources, attachText: attach ? (attach.docText || `(người dùng đính kèm ${attach.inlines.length} ảnh, hãy xem trực tiếp)`) : null }),
      files: attach ? attach.inlines : null,
      maxTokens,
      temperature: 0.2,
      timeoutMs: attach ? 90000 : undefined,
      only,
      onDelta: (text) => emit(text),
    });
    const result = {
      answer: acc || redactPII(res.text),
      sources,
      knowledge: [],
      provider: res.provider,
      model: res.model,
      latencyMs: res.latencyMs,
      fallbackReason: res.fallbackReason,
      tool: (dataResult && dataResult.tool) || null,
    };
    storeResult(result);
    await doLog({ question: q, answer: result.answer, sources, provider: res.provider, latencyMs: res.latencyMs, fallbackReason: res.fallbackReason, userId: user?.id, tool: result.tool, promptTokens: res.usage?.prompt, completionTokens: res.usage?.completion, hasAttachment: !!attach, attachmentTypes: attach ? attach.types.join(',') : null });
    return result;
  } catch (err) {
    if (anyEmitted) {
      return { answer: acc, sources, knowledge: [], provider: null, latencyMs: 0, fallbackReason: JSON.stringify(err.attempts || err.message) };
    }
    const msg = dataContext || 'Hệ thống trả lời đang tạm quá tải. Bạn thử lại sau ít phút, hoặc xem trực tiếp các bài liên quan bên dưới.';
    const result = { answer: msg, sources: dataContext ? [] : sources, knowledge: [], provider: null, latencyMs: 0, fallbackReason: JSON.stringify(err.attempts || err.message) };
    await doLog({ question: q, answer: result.answer, sources: result.sources, provider: null, latencyMs: 0, fallbackReason: result.fallbackReason, userId: user?.id });
    emit(msg);
    return result;
  }
}

module.exports = { ask, askStream, isEnabled, stripHtml, htmlToStructuredText, redactPII, SYSTEM_PROMPT, sanitizeHistory, detectIntent, selectSections };
