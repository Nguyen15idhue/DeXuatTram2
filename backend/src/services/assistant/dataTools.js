const pool = require('../../utils/db');
const { TILE_PROVIDERS } = require('../../config/tileProviders');

const ENABLED = () => process.env.ASSISTANT_DATA_TOOLS !== 'false';

const FIELD_TYPES = [
  'text', 'textarea', 'number', 'email', 'phone', 'url', 'date', 'datetime',
  'boolean', 'select', 'multiselect', 'file', 'formula', 'user', 'table',
];

const MAP_MODE_LABELS = { streets: 'Đường phố', satellite: 'Vệ tinh', hybrid: 'Vệ tinh + nhãn', terrain: 'Địa hình' };
const RENDERER_LABELS = { leaflet: 'Leaflet', maplibre: 'MapLibre' };

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function nowVN() {
  try {
    return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return new Date().toISOString();
  }
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function detectEntity(nq) {
  if (/(de xuat|proposal)/.test(nq)) return 'station_proposals';
  if (/(tram|station)/.test(nq)) return 'stations';
  if (/(user|nguoi dung|tai khoan|nhan su)/.test(nq)) return 'users';
  return null;
}

const MODEL_LABELS = { TDT: 'Tự đầu tư (TDT)', NQ: 'Nhượng quyền (NQ)', LK: 'Liên kết (LK)', NQ_LK: 'Nhượng quyền + Liên kết (NQ_LK)' };

function detectModel(nq) {
  if (/nq_lk|nq-lk|nhuong quyen.*lien ket|lien ket.*nhuong quyen|hon hop|ca hai/.test(nq)) return 'NQ_LK';
  if (/tu dau tu|\btdt\b|tram doi tac/.test(nq)) return 'TDT';
  if (/nhuong quyen|\bnq\b/.test(nq)) return 'NQ';
  if (/lien ket|\blk\b/.test(nq)) return 'LK';
  return null;
}

function isSectionVisible(meta, model) {
  if (!meta.visibleWhen) return true;
  if (!model) return false;
  return meta.visibleWhen.value === model;
}

function fieldVisible(conditions, model) {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  const modelConds = conditions.filter((c) => c && c.field === 'mo_hinh_dau_tu');
  if (modelConds.length === 0) return true;
  if (!model) return false;
  return modelConds.some((c) => c.value === model);
}

async function getFormFields(nq) {
  if (!/(can nhap|nhap (thong tin )?gi|can dien|dien (thong tin )?gi|nhung truong (gi|nao)|co nhung truong|gom nhung (truong|gi)|thong tin nao|dien (nhu )?(the nao|ntn|sao)|cach (tao|lam)|(tao|them) (1 |mot )?(de xuat|tram))/ .test(nq)) return null;
  if (/(trang thai|status)/.test(nq)) return null;
  if (/\bform\b/.test(nq) && /(may|bao nhieu|so luong)/.test(nq) && /(truong|cot)/.test(nq)) return null;
  if (/(may cach|bao nhieu cach|cach nao|nhung cach)/.test(nq)) return null;
  const model = detectModel(nq);
  const entity = detectEntity(nq) || (model ? 'station_proposals' : null);
  if (!entity) return null;

  const [forms] = await pool.query(
    "SELECT id, layout_config FROM forms WHERE entity = ? AND purpose = 'create' AND status = 'active' ORDER BY is_default DESC, id ASC LIMIT 1",
    [entity]
  );
  if (forms.length === 0) return null;

  const [fields] = await pool.query(
    "SELECT ff.order_index, fd.label, fd.`key`, fd.type, fd.required, ff.config FROM form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id WHERE ff.form_id = ? ORDER BY ff.order_index",
    [forms[0].id]
  );

  const layout = parseJson(forms[0].layout_config, {}) || {};
  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const rowToSection = {};
  const sectionMeta = {};
  for (const s of sections) {
    sectionMeta[s.id] = { title: s.title, visibleWhen: s.visibleWhen || null, type: s.type || 'section', tabs: s.tabs || [] };
    for (const r of (s.rows || [])) rowToSection[r.id] = s.id;
  }

  const visibleSectionIds = new Set();
  for (const s of sections) {
    const meta = sectionMeta[s.id];
    if (meta.type === 'tabs') {
      if (isSectionVisible(meta, model)) {
        for (const tab of meta.tabs) for (const ref of (tab.sectionRefs || [])) visibleSectionIds.add(ref);
      }
    } else if (isSectionVisible(meta, model)) {
      visibleSectionIds.add(s.id);
    }
  }

  const groups = {};
  const noSection = [];
  const sectionOf = (rowId) => {
    if (!rowId) return null;
    if (rowToSection[rowId]) return rowToSection[rowId];
    for (const s of sections) if (rowId.startsWith(s.id + '_')) return s.id;
    return null;
  };
  for (const f of fields) {
    const cfg = parseJson(f.config, {}) || {};
    if (!fieldVisible(cfg.conditions, model)) continue;
    const sid = sectionOf(cfg.rowId);
    if (sid && visibleSectionIds.has(sid)) {
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(f);
    } else if (!sid) {
      noSection.push(f);
    }
  }

  const lines = [];
  for (const s of sections) {
    if (!groups[s.id] || groups[s.id].length === 0) continue;
    lines.push(`**${sectionMeta[s.id].title}**`);
    for (const f of groups[s.id]) lines.push(`- ${f.label}${f.required ? ' (bắt buộc)' : ''}`);
  }
  if (noSection.length) {
    lines.push('**Khác**');
    for (const f of noSection) lines.push(`- ${f.label}${f.required ? ' (bắt buộc)' : ''}`);
  }
  if (lines.length === 0) return null;

  const entityLabel = entity === 'stations' ? 'trạm' : (entity === 'users' ? 'user' : 'đề xuất');
  const head = model
    ? `Để tạo đề xuất mô hình ${MODEL_LABELS[model]}, bạn cần nhập:`
    : `Các trường cần nhập khi tạo ${entityLabel} (trường riêng theo mô hình sẽ hiện thêm khi bạn chọn mô hình):`;
  const tail = model ? '' : '\nKhi chọn mô hình cụ thể sẽ có thêm trường riêng (TDT/NQ/LK/NQ_LK).';
  const wantsProcess = /(lam (nhu )?(the nao|ntn|sao)|cach |quy trinh|cac buoc|huong dan)/.test(nq);
  return { skipDocs: !wantsProcess, text: `${head}\n${lines.join('\n')}${tail}` };
}

const COUNT_RE = /(bao nhieu|tong so|so luong|\bdem\b|co may|tong cong|bao gom bao nhieu)/;
const SENSITIVE_RE = /(user|nguoi dung|tai khoan|nhan su|nhan vien|thanh vien|tram\b|tram sac|station|de xuat|proposal|danh muc du lieu|data ?list|datalist|\btep\b|\bfile\b|thong bao|notification|nhat ky|\blog\b|api config|cau hinh api|geocode cache|external|contact|1office)/;

const COUNT_TARGETS = [
  { id: 'help_articles', label: 'bài hướng dẫn', re: /(bai huong dan|bai viet huong dan|huong dan)/, sql: "SELECT COUNT(*) AS n FROM help_articles WHERE status = 'published'" },
  { id: 'help_categories', label: 'danh mục hướng dẫn', re: /(danh muc huong dan|chuyen muc huong dan|nhom huong dan)/, sql: 'SELECT COUNT(*) AS n FROM help_categories' },
  { id: 'field_definitions', label: 'trường động', re: /(truong dong|truong du lieu|\bfield\b)/, sql: 'SELECT COUNT(*) AS n FROM field_definitions' },
  { id: 'forms', label: 'form', re: /\bform\b/, sql: 'SELECT COUNT(*) AS n FROM forms' },
  { id: 'views', label: 'view', re: /\bview\b/, sql: 'SELECT COUNT(*) AS n FROM views' },
  { id: 'map_configs', label: 'cấu hình bản đồ', re: /(cau hinh ban do|\bban do\b)/, sql: 'SELECT COUNT(*) AS n FROM map_configs' },
];

const DENY_TEXT = 'Trợ lý không truy cập dữ liệu vận hành (người dùng, trạm, đề xuất, danh mục dữ liệu, tệp, nhật ký...). Bạn xem thông tin này trực tiếp ở trang quản trị tương ứng nhé.';

// ---------- Tier 1 ----------

async function getCurrentTime(nq) {
  if (!/(hom nay|bay gio|may gio|ngay may|thoi gian hien tai|hom qua|ngay bao nhieu)/.test(nq)) return null;
  return { skipDocs: true, direct: true, text: `Thời gian hệ thống hiện tại: ${nowVN()} (múi giờ Việt Nam).` };
}

async function getLifecycleRules(nq) {
  if (!/(bao (lau|nhieu) (ngay|thang|gio))|bao lau|(sau|qua) [0-9]+ ngay|tu dong (tao|huy)|tu tao (tram|de xuat)|vong doi.*(bao lau|ngay|thoi gian)|qua han.*huy/.test(nq)) return null;
  const [rows] = await pool.query('SELECT `key`, value FROM proposal_lifecycle_configs');
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  const parts = [];
  if (map.contract_signed_to_station_days) parts.push(`Đề xuất "Ký thành công" sau ${map.contract_signed_to_station_days} ngày (chưa thành trạm) sẽ tự tạo trạm`);
  if (map.contract_failed_to_cancel_days) parts.push(`Đề xuất "Ký thất bại" sau ${map.contract_failed_to_cancel_days} ngày sẽ tự chuyển "Đã hủy"`);
  if (map.review_supplement_days) parts.push(`Bổ sung hồ sơ ở bước xem xét: ${map.review_supplement_days} ngày`);
  if (map.principle_supplement_days) parts.push(`Bổ sung hồ sơ ở bước duyệt chủ trương: ${map.principle_supplement_days} ngày`);
  if (map.lifecycle_max_retries) parts.push(`Số lần thử lại tối đa khi tự động lỗi: ${map.lifecycle_max_retries}`);
  if (parts.length === 0) return null;
  return { skipDocs: true, direct: true, text: `Quy tắc vòng đời tự động của đề xuất: ${parts.join('; ')}.` };
}

async function countEntities(nq) {
  if (!COUNT_RE.test(nq)) return null;
  if (/(trang thai|status)/.test(nq)) return null;
  if (/\bcach\b/.test(nq)) return null;
  if (/(may truong|may cot|bao nhieu truong|bao nhieu cot|gom may)/.test(nq)) return null;
  if (SENSITIVE_RE.test(nq)) return { skipDocs: true, deny: true, text: DENY_TEXT };
  const target = COUNT_TARGETS.find((t) => t.re.test(nq));
  if (!target) return { skipDocs: true, deny: true, text: DENY_TEXT };
  const [rows] = await pool.query(target.sql);
  const n = Number(rows[0] && rows[0].n) || 0;
  return { skipDocs: true, direct: true, text: `Tổng số ${target.label}: ${n}. (Tính đến ${nowVN()}).` };
}

async function getFieldMeta(nq) {
  if (!/(truong|\bfield\b)/.test(nq)) return null;
  if (!/(dien|dinh dang|kieu|bat buoc|nhap|lua chon|gia tri|validate|option|su dung)/.test(nq)) return null;
  const [defs] = await pool.query(
    "SELECT entity, `key`, label, type, required, source_type, is_locked, options, data_list_id FROM field_definitions WHERE status IS NULL OR status <> 'inactive'"
  );
  let best = null;
  for (const d of defs) {
    const label = normalize(d.label);
    const key = normalize(d.key);
    let score = 0;
    if (label.length >= 4 && nq.includes(label)) score = label.length + 2;
    if (key.length >= 3 && nq.includes(key)) score = Math.max(score, key.length);
    if (score > 0 && (!best || score > best.score)) best = { d, score };
  }
  if (!best) return null;

  const d = best.d;
  const lines = [`Trường **${d.label}** (\`${d.key}\`) thuộc ${d.entity}:`];
  lines.push(`- Kiểu dữ liệu: \`${d.type}\``);
  lines.push(`- Bắt buộc: ${d.required ? 'Có' : 'Không'}`);
  lines.push(`- Nguồn: ${d.source_type === 'fixed' ? 'cột hệ thống' : 'trường động (custom_data)'}`);
  if (d.is_locked) lines.push('- Trường bị khóa (không thể sửa/xóa cấu hình).');

  if (['select', 'multiselect'].includes(d.type)) {
    if (d.data_list_id) {
      lines.push('- Lựa chọn: lấy từ **danh mục dữ liệu** (không hiển thị giá trị).');
    } else {
      const opts = parseJson(d.options, []) || [];
      const labels = opts.slice(0, 30).map((o) => (typeof o === 'string' ? o : (o.label || o.value))).filter(Boolean);
      if (labels.length > 0) lines.push(`- Lựa chọn (${opts.length}): ${labels.join(', ')}${opts.length > 30 ? ', …' : ''}`);
    }
  }
  return { skipDocs: false, text: lines.join('\n') };
}

async function getStatusLabels(nq) {
  if (!/(trang thai|status)/.test(nq)) return null;
  if (!/(nhung|gom|co may|liet ke|cac|la gi|bao gom|nao)/.test(nq)) return null;
  const entity = detectEntity(nq);
  const entities = entity ? [entity] : ['stations', 'station_proposals'];
  const [rows] = await pool.query(
    "SELECT entity, options, data_list_id FROM field_definitions WHERE `key` = 'status' AND entity IN (?, ?)",
    ['stations', 'station_proposals']
  );
  const out = [];
  for (const e of entities) {
    const row = rows.find((r) => r.entity === e);
    if (!row) continue;
    let opts = [];
    if (!row.data_list_id) {
      opts = (parseJson(row.options, []) || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
    }
    if (opts.length === 0) continue;
    const name = e === 'stations' ? 'Trạm' : 'Đề xuất';
    out.push(`**${name}**: ${opts.map((o) => `${o.label || o.value} (\`${o.value}\`)`).join(', ')}`);
  }
  if (out.length === 0) return null;
  return { skipDocs: true, direct: true, text: `Các trạng thái trong hệ thống:\n${out.join('\n')}` };
}

async function getFieldTypes(nq) {
  if (!/(loai truong|kieu truong|\bfield type|ho tro.*(loai|kieu).*(truong|du lieu)|cac loai truong|nhung loai truong)/.test(nq)) return null;
  return { skipDocs: true, direct: true, text: `Hệ thống hỗ trợ các loại trường: ${FIELD_TYPES.map((t) => `\`${t}\``).join(', ')}.` };
}

async function getFormInfo(nq) {
  if (!/\bform\b/.test(nq)) return null;
  if (!/(gom|may truong|co gi|bao gom|nhu the nao|tao|dung cho|cau hinh)/.test(nq)) return null;
  const entity = detectEntity(nq);
  const where = entity ? 'WHERE f.entity = ?' : '';
  const params = entity ? [entity] : [];
  const [rows] = await pool.query(
    `SELECT f.id, f.entity, f.name, f.purpose, f.status, f.is_default, COUNT(ff.id) AS field_count
     FROM forms f LEFT JOIN form_fields ff ON ff.form_id = f.id
     ${where} GROUP BY f.id ORDER BY f.entity, f.id`,
    params
  );
  if (rows.length === 0) return { skipDocs: true, direct: true, text: 'Chưa có form nào phù hợp trong hệ thống.' };
  const lines = rows.map((r) => `- ${r.name} (${r.entity}, mục đích: ${r.purpose || 'all'}, ${r.status}${r.is_default ? ', mặc định' : ''}) — ${Number(r.field_count)} trường`);
  return { skipDocs: true, direct: true, text: `Danh sách form:\n${lines.join('\n')}` };
}

async function getViewInfo(nq) {
  if (!/\bview\b/.test(nq)) return null;
  if (!/(gom|may cot|co gi|bao gom|nhu the nao|hien thi|cau hinh|cot)/.test(nq)) return null;
  const entity = detectEntity(nq);
  const where = entity ? 'WHERE v.entity = ?' : '';
  const params = entity ? [entity] : [];
  const [rows] = await pool.query(
    `SELECT v.id, v.entity, v.name, v.usage, v.status, COUNT(vf.id) AS col_count
     FROM views v LEFT JOIN view_fields vf ON vf.view_id = v.id
     ${where} GROUP BY v.id ORDER BY v.entity, v.id`,
    params
  );
  if (rows.length === 0) return { skipDocs: true, direct: true, text: 'Chưa có view nào phù hợp trong hệ thống.' };
  const lines = rows.map((r) => `- ${r.name} (${r.entity}, dùng cho: ${r.usage || 'table'}, ${r.status}) — ${Number(r.col_count)} cột`);
  return { skipDocs: true, direct: true, text: `Danh sách view:\n${lines.join('\n')}` };
}

async function getMapConfig(nq) {
  if (!/(\bban do\b|\bmap\b)/.test(nq)) return null;
  if (!/(dang dung|hien tai|ban do gi|ban do nao|dung (loai )?ban do|thong so ban do)/.test(nq)) return null;
  const [rows] = await pool.query(
    'SELECT renderer, default_mode, tile_mode, retina, enable_3d, center_lat, center_lng, default_zoom, max_zoom, tile_provider_id FROM map_configs WHERE entity = ? LIMIT 1',
    ['stations']
  );
  if (rows.length === 0) return { skipDocs: true, direct: true, text: 'Chưa có cấu hình bản đồ trong hệ thống.' };
  const c = rows[0];
  const provider = TILE_PROVIDERS.find((p) => p.id === c.tile_provider_id);
  const providerName = provider ? provider.name : (c.tile_provider_id || 'không rõ');
  const parts = [
    `nhà cung cấp nền bản đồ: **${providerName}**`,
    `renderer: **${RENDERER_LABELS[c.renderer] || c.renderer}**`,
    `chế độ mặc định: **${MAP_MODE_LABELS[c.default_mode] || c.default_mode}**`,
    `kiểu tải tile: ${c.tile_mode === 'proxy' ? 'proxy (server giữ khóa)' : 'direct (trình duyệt gọi trực tiếp)'}`,
    `retina: ${c.retina ? 'bật' : 'tắt'}`,
    `3D: ${c.enable_3d ? 'bật' : 'tắt'}`,
    `tâm bản đồ: ${Number(c.center_lat).toFixed(4)}, ${Number(c.center_lng).toFixed(4)} (zoom ${c.default_zoom}, tối đa ${c.max_zoom})`,
  ];
  return { skipDocs: true, direct: true, text: `Bản đồ đang dùng: ${parts.join('; ')}.` };
}

async function getMapProviders(nq) {
  if (!/(nha cung cap|provider|nguon).*(\bban do\b|map)|\bban do\b.*(nha cung cap|provider|nguon)|co nhung.*\bban do\b|danh sach.*\bban do\b/.test(nq)) return null;
  const free = TILE_PROVIDERS.filter((p) => !p.requires_key).map((p) => p.name);
  const paid = TILE_PROVIDERS.filter((p) => p.requires_key).map((p) => p.name);
  const parts = [];
  if (free.length) parts.push(`Miễn phí (không cần khóa): ${free.join(', ')}`);
  if (paid.length) parts.push(`Cần khóa API: ${paid.join(', ')}`);
  return { skipDocs: true, direct: true, text: `Các nhà cung cấp bản đồ hỗ trợ:\n- ${parts.join('\n- ')}` };
}

async function getGeocodeProvider(nq) {
  if (!/(geocode)|(dia chi.*(dich vu|provider|\bapi\b|tra cuu))|((dich vu|provider|tra cuu).*dia chi)/.test(nq)) return null;
  const [rows] = await pool.query('SELECT provider, enabled FROM geocode_configs WHERE enabled = 1 LIMIT 1');
  if (rows.length === 0) return { skipDocs: true, direct: true, text: 'Chưa cấu hình dịch vụ tra cứu địa chỉ.' };
  return { skipDocs: true, direct: true, text: `Dịch vụ tra cứu địa chỉ (reverse geocode) đang dùng: **${rows[0].provider}**.` };
}

async function getHelpToc(nq) {
  if (!/(muc luc|danh muc.*(huong dan|bai)|trang huong dan co gi|co nhung (bai|muc)|cac chu de huong dan)/.test(nq)) return null;
  const [rows] = await pool.query(
    "SELECT c.title, COUNT(a.id) AS n FROM help_categories c LEFT JOIN help_articles a ON a.category_id = c.id AND a.status = 'published' GROUP BY c.id ORDER BY c.sort_order, c.id"
  );
  if (rows.length === 0) return null;
  const lines = rows.map((r) => `- ${r.title} (${Number(r.n)} bài)`);
  return { skipDocs: true, direct: true, text: `Các chuyên mục hướng dẫn:\n${lines.join('\n')}` };
}

const TOOL_ORDER = [
  getCurrentTime,
  getLifecycleRules,
  countEntities,
  getFormFields,
  getFieldMeta,
  getStatusLabels,
  getFieldTypes,
  getFormInfo,
  getViewInfo,
  getMapProviders,
  getMapConfig,
  getGeocodeProvider,
  getHelpToc,
];

async function lookup(question, user) {
  if (!ENABLED()) return null;
  const nq = normalize(question);
  if (!nq) return null;
  for (const tool of TOOL_ORDER) {
    try {
      const res = await tool(nq, user);
      if (res) return { ...res, tool: tool.name };
    } catch (err) {
      console.error(`[assistant] dataTool ${tool.name} error:`, err.message);
      return { skipDocs: true, error: true, text: 'Không truy vấn được dữ liệu lúc này. Bạn thử lại sau.' };
    }
  }
  return null;
}

module.exports = { lookup, FIELD_TYPES, COUNT_TARGETS, detectModel };
