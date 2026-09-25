const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const parser = new DOMParser();
const serializer = new XMLSerializer();

const TOKEN_RE = /\{[#/]?[a-zA-Z0-9_.]+\}/g;
const CM_TO_TWIP = 567;

const PPR_ORDER = [
  'w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl',
  'w:numPr', 'w:suppressLineNumbers', 'w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens',
  'w:kinsoku', 'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN',
  'w:bidi', 'w:adjustRightInd', 'w:snapToGrid', 'w:spacing', 'w:ind', 'w:contextualSpacing',
  'w:mirrorIndents', 'w:suppressOverlap', 'w:jc', 'w:textDirection', 'w:textAlignment',
  'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr', 'w:pPrChange',
];

const parse = (xml) => parser.parseFromString(xml, 'text/xml');
const serialize = (doc) => serializer.serializeToString(doc);

const children = (el, name) => {
  const out = [];
  for (let n = el && el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (!name || n.nodeName === name)) out.push(n);
  }
  return out;
};

const firstChild = (el, name) => children(el, name)[0] || null;

const findDescendants = (el, name, acc = []) => {
  for (let n = el && el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1) {
      if (n.nodeName === name) acc.push(n);
      findDescendants(n, name, acc);
    }
  }
  return acc;
};

const paraText = (p) => findDescendants(p, 'w:t').map((t) => t.textContent || '').join('');

const tokensInText = (text) => {
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) out.push(m[0]);
  return out;
};

const el = (doc, name, attrs) => {
  const e = doc.createElement(name);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v !== undefined && v !== null) e.setAttribute(k, String(v)); });
  return e;
};

const ensureChild = (doc, parent, name, order) => {
  let c = firstChild(parent, name);
  if (c) return c;
  c = el(doc, name);
  const list = order || [];
  const idx = list.indexOf(name);
  if (idx >= 0) {
    for (let n = parent.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      const ni = list.indexOf(n.nodeName);
      if (ni > idx) { parent.insertBefore(c, n); return c; }
    }
  }
  parent.appendChild(c);
  return c;
};

const ensurePPr = (doc, p) => ensureChild(doc, p, 'w:pPr', ['w:pPr']);

const setPPrChild = (doc, pPr, name, attrs) => {
  let c = firstChild(pPr, name);
  if (!c) {
    c = el(doc, name);
    const idx = PPR_ORDER.indexOf(name);
    let inserted = false;
    for (let n = pPr.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      const ni = PPR_ORDER.indexOf(n.nodeName);
      if (ni > idx) { pPr.insertBefore(c, n); inserted = true; break; }
    }
    if (!inserted) pPr.appendChild(c);
  }
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined) c.removeAttribute(k); else c.setAttribute(k, String(v));
  });
  return c;
};

const findBody = (doc) => {
  const list = doc.getElementsByTagName('w:body');
  return list.length ? list[0] : null;
};

const extractTree = (xmlOrDoc) => {
  const doc = typeof xmlOrDoc === 'string' ? parse(xmlOrDoc) : xmlOrDoc;
  const body = findBody(doc);
  const map = new Map();
  let nextId = 1;

  const blockNode = (block) => {
    if (block.nodeName === 'w:p') {
      const id = nextId++;
      const text = paraText(block);
      const pPr = firstChild(block, 'w:pPr');
      const jc = pPr && firstChild(pPr, 'w:jc') ? (firstChild(pPr, 'w:jc').getAttribute('w:val') || 'left') : 'left';
      const ind = pPr && firstChild(pPr, 'w:ind');
      const tabsEl = pPr && firstChild(pPr, 'w:tabs');
      const tabs = tabsEl ? children(tabsEl, 'w:tab').map((t) => ({ val: t.getAttribute('w:val') || 'left', pos: Number(t.getAttribute('w:pos') || 0) })) : [];
      const node = {
        id, type: 'p', text, tokens: tokensInText(text), jc,
        indentLeft: ind ? Number(ind.getAttribute('w:left') || 0) : 0,
        indentFirst: ind ? Number(ind.getAttribute('w:firstLine') || 0) : 0,
        tabs,
      };
      map.set(id, { kind: 'p', el: block });
      return node;
    }
    if (block.nodeName === 'w:tbl') {
      const id = nextId++;
      const rows = children(block, 'w:tr').map((tr) => {
        const rid = nextId++;
        map.set(rid, { kind: 'tr', el: tr });
        const cells = children(tr, 'w:tc').map((tc) => {
          const cid = nextId++;
          map.set(cid, { kind: 'tc', el: tc });
          const blocks = children(tc).filter((c) => c.nodeName === 'w:p' || c.nodeName === 'w:tbl').map(blockNode);
          return { id: cid, type: 'tc', blocks };
        });
        return { id: rid, type: 'tr', cells };
      });
      map.set(id, { kind: 'tbl', el: block });
      return { id, type: 'tbl', rows };
    }
    return null;
  };

  const blocks = body ? children(body).filter((c) => c.nodeName === 'w:p' || c.nodeName === 'w:tbl').map(blockNode).filter(Boolean) : [];
  return { tree: blocks, map, body, doc };
};

const markerRun = (doc, id) => {
  const r = el(doc, 'w:r');
  const rPr = el(doc, 'w:rPr');
  rPr.appendChild(el(doc, 'w:vanish'));
  r.appendChild(rPr);
  const t = el(doc, 'w:t', { 'xml:space': 'preserve' });
  t.appendChild(doc.createTextNode(`@{${id}}@`));
  r.appendChild(t);
  return r;
};

const injectAnchors = (xml) => {
  const { tree, map, doc } = extractTree(xml);
  const paras = [];
  const walk = (nodes) => nodes.forEach((n) => {
    if (n.type === 'p') paras.push(n.id);
    else if (n.type === 'tbl') n.rows.forEach((r) => r.cells.forEach((c) => walk(c.blocks)));
  });
  walk(tree);
  paras.forEach((id) => {
    const entry = map.get(id);
    if (!entry) return;
    entry.el.insertBefore(markerRun(doc, id), entry.el.firstChild);
  });
  return serialize(doc);
};

const findParagraph = (xml, id) => {
  const { map } = extractTree(xml);
  const entry = map.get(id);
  if (!entry || entry.kind !== 'p') return null;
  return entry.el;
};

const cloneRPr = (doc, p) => {
  const runs = children(p, 'w:r');
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const rPr = firstChild(runs[i], 'w:rPr');
    if (rPr) return rPr.cloneNode(true);
  }
  return null;
};

const insertToken = (xml, nodeId, name) => {
  const clean = String(name || '').trim().replace(/[^a-zA-Z0-9_.]/g, '_');
  if (!clean) throw Object.assign(new Error('Tên token không hợp lệ'), { statusCode: 400 });
  const doc = parse(xml);
  const { map } = extractTree(doc);
  const entry = map.get(nodeId);
  const p = entry && entry.kind === 'p' ? entry.el : null;
  if (!p) throw Object.assign(new Error('Không tìm thấy đoạn để chèn'), { statusCode: 404 });
  const run = el(doc, 'w:r');
  const rPr = cloneRPr(doc, p);
  if (rPr) run.appendChild(rPr);
  const t = el(doc, 'w:t', { 'xml:space': 'preserve' });
  const prefix = paraText(p).length > 0 ? ' ' : '';
  t.appendChild(doc.createTextNode(`${prefix}{${clean}}`));
  run.appendChild(t);
  p.appendChild(run);
  return { xml: serialize(doc), token: `{${clean}}` };
};

const removeRunRange = (doc, p, start, end) => {
  const runs = children(p, 'w:r');
  const spans = [];
  let pos = 0;
  runs.forEach((r) => {
    const tEls = findDescendants(r, 'w:t');
    tEls.forEach((t) => {
      const s = pos;
      pos += (t.textContent || '').length;
      spans.push({ t, start: s, end: pos });
    });
  });
  spans.forEach((sp) => {
    if (sp.end <= start || sp.start >= end) return;
    const text = sp.t.textContent || '';
    const from = Math.max(0, start - sp.start);
    const to = Math.min(text.length, end - sp.start);
    const next = text.slice(0, from) + text.slice(to);
    sp.t.textContent = next;
  });
  runs.forEach((r) => {
    if (findDescendants(r, 'w:t').every((t) => (t.textContent || '') === '')) {
      if (findDescendants(r, 'w:tab').length === 0 && findDescendants(r, 'w:br').length === 0) {
        if (r.parentNode) r.parentNode.removeChild(r);
      }
    }
  });
};

const removeToken = (xml, nodeId, tokenName) => {
  const doc = parse(xml);
  const { map } = extractTree(doc);
  const entry = map.get(nodeId);
  const p = entry && entry.kind === 'p' ? entry.el : null;
  if (!p) throw Object.assign(new Error('Không tìm thấy đoạn'), { statusCode: 404 });
  const full = paraText(p);
  const needle = `{${tokenName}}`;
  const idx = full.indexOf(needle);
  if (idx < 0) throw Object.assign(new Error(`Không tìm thấy token ${needle}`), { statusCode: 404 });
  removeRunRange(doc, p, idx, idx + needle.length);
  return serialize(doc);
};

const align = (xml, nodeId, opts = {}) => {
  const doc = parse(xml);
  const { map } = extractTree(doc);
  const entry = map.get(nodeId);
  if (!entry || entry.kind !== 'p') throw Object.assign(new Error('Không tìm thấy đoạn'), { statusCode: 404 });
  const p = entry.el;
  const pPr = ensurePPr(doc, p);
  if (opts.jc) setPPrChild(doc, pPr, 'w:jc', { 'w:val': opts.jc });
  if (opts.indentLeftCm !== undefined && opts.indentLeftCm !== null) {
    setPPrChild(doc, pPr, 'w:ind', { 'w:left': String(Math.round(Number(opts.indentLeftCm) * CM_TO_TWIP)) });
  }
  if (opts.tabPosCm !== undefined && opts.tabPosCm !== null) {
    const tabs = ensureChild(doc, pPr, 'w:tabs', PPR_ORDER);
    const tab = el(doc, 'w:tab', { 'w:val': 'left', 'w:pos': String(Math.round(Number(opts.tabPosCm) * CM_TO_TWIP)) });
    tabs.appendChild(tab);
  }
  if (opts.copyFromId) {
    const ref = map.get(opts.copyFromId);
    if (!ref || ref.kind !== 'p') throw Object.assign(new Error('Không tìm thấy đoạn mốc để căn'), { statusCode: 404 });
    const refPPr = firstChild(ref.el, 'w:pPr');
    if (refPPr) {
      ['w:tabs', 'w:ind', 'w:jc'].forEach((tag) => {
        const src = firstChild(refPPr, tag);
        if (!src) return;
        const cur = firstChild(pPr, tag);
        if (cur) pPr.removeChild(cur);
        const clone = src.cloneNode(true);
        const idx = PPR_ORDER.indexOf(tag);
        let inserted = false;
        for (let n = pPr.firstChild; n; n = n.nextSibling) {
          if (n.nodeType !== 1) continue;
          if (PPR_ORDER.indexOf(n.nodeName) > idx) { pPr.insertBefore(clone, n); inserted = true; break; }
        }
        if (!inserted) pPr.appendChild(clone);
      });
    }
  }
  return serialize(doc);
};

module.exports = {
  extractTree,
  injectAnchors,
  insertToken,
  removeToken,
  align,
  tokensInText,
  paraText,
  CM_TO_TWIP,
};
