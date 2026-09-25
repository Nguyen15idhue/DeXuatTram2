import { useEffect, useRef, useState } from 'react';

const TOKEN_RE = /\{[#/]?[a-zA-Z0-9_.]+\}/g;

const stripToken = (tok) => tok.replace(/[{}#/]/g, '');

const DocxPreviewPane = ({ docxBytes, bindings, loopKeys, dragPayload, onDropToken, onDropLoop, onUnbind, chipMode }) => {
  const mode = chipMode === 'key' ? 'key' : 'label';
  const boxRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [renderKey, setRenderKey] = useState(0);
  const dropRef = useRef(null);
  dropRef.current = { onDropToken, onDropLoop, onUnbind };

  useEffect(() => {
    let cancelled = false;
    const box = boxRef.current;
    if (!box || !docxBytes) return;
    setLoading(true);
    setError('');
    box.innerHTML = '';
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        await renderAsync(docxBytes, box, null, { className: 'dxp', breakPages: true });
        if (!cancelled) setRenderKey((k) => k + 1);
      } catch {
        if (!cancelled) setError('Không render được file docx');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docxBytes]);

  const refreshChip = (chip) => {
    const name = chip.getAttribute('data-doc-token');
    if (!name) return;
    if (chip.hasAttribute('data-doc-loop') || chip.hasAttribute('data-doc-loop-close')) {
      chip.style.display = 'none';
      return;
    }
    const info = bindings ? bindings[name] : null;
    const label = info && typeof info === 'object' ? info.label : info;
    const key = info && typeof info === 'object' ? info.key : null;
    chip.querySelectorAll(':scope > code, :scope > .dxp-badge, :scope > .dxp-unbind, :scope > .dxp-labelonly, :scope > .dxp-val, :scope > .dxp-empty').forEach((el) => el.remove());
    chip.classList.remove('dxp-bound');
    if (label) {
      chip.classList.add('dxp-bound');
      const s = document.createElement('span');
      s.className = 'dxp-val';
      s.textContent = (mode === 'key' && key) ? key : label;
      s.title = (mode === 'key' && key) ? label : (key || chip.getAttribute('data-doc-text') || '');
      chip.appendChild(s);
      appendUnbind(chip, name);
    } else {
      const s = document.createElement('span');
      s.className = 'dxp-empty';
      s.title = 'Thả trường vào đây';
      chip.appendChild(s);
    }
  };

  const appendUnbind = (chip, name) => {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'dxp-unbind';
    x.textContent = '✕';
    x.title = 'Gỡ gán';
    x.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (dropRef.current.onUnbind) dropRef.current.onUnbind(name);
    });
    chip.appendChild(x);
  };

  useEffect(() => {
    const box = boxRef.current;
    if (!box || loading) return;
    box.querySelectorAll('[data-doc-token]').forEach(refreshChip);
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || n.nodeValue.indexOf('{') < 0) continue;
      if (n.parentElement && n.parentElement.closest('[data-doc-token]')) continue;
      nodes.push(n);
    }
    nodes.forEach((textNode) => {
      const text = textNode.nodeValue;
      TOKEN_RE.lastIndex = 0;
      let m;
      let last = 0;
      const frag = document.createDocumentFragment();
      let found = false;
      while ((m = TOKEN_RE.exec(text))) {
        found = true;
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        frag.appendChild(buildChip(m[0]));
        last = m.index + m[0].length;
      }
      if (!found) return;
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    });

    function buildChip(tok) {
      const name = stripToken(tok);
      const isOpen = tok.startsWith('{#');
      const isClose = tok.startsWith('{/');
      const span = document.createElement('span');
      span.className = 'dxp-token' + (isClose ? ' dxp-token-close' : '');
      span.setAttribute('data-doc-token', name);
      span.setAttribute('data-doc-text', tok);
      if (isOpen) span.setAttribute('data-doc-loop', name);
      if (isClose) span.setAttribute('data-doc-loop-close', '1');
      const code = document.createElement('code');
      code.textContent = tok;
      span.appendChild(code);
      if (!isClose) refreshChip(span);
      return span;
    }
  }, [renderKey, loading, bindings, loopKeys, mode]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const over = (e) => {
      const t = e.target.closest ? e.target.closest('[data-doc-token]') : null;
      if (!t || t.hasAttribute('data-doc-loop-close')) return;
      e.preventDefault();
      t.classList.add('dxp-drop-hover');
    };
    const leave = (e) => {
      const t = e.target.closest ? e.target.closest('[data-doc-token]') : null;
      if (t) t.classList.remove('dxp-drop-hover');
    };
    const drop = (e) => {
      const t = e.target.closest ? e.target.closest('[data-doc-token]') : null;
      if (!t) return;
      e.preventDefault();
      t.classList.remove('dxp-drop-hover');
      const name = t.getAttribute('data-doc-token');
      let payload = dropRef.currentPayload;
      if (!payload) {
        try {
          const raw = e.dataTransfer && e.dataTransfer.getData('text/plain');
          if (raw) payload = JSON.parse(raw);
        } catch {}
      }
      if (!payload) return;
      if (t.hasAttribute('data-doc-loop')) {
        if (dropRef.current.onDropLoop) dropRef.current.onDropLoop(name, payload);
      } else if (dropRef.current.onDropToken) {
        dropRef.current.onDropToken(name, payload);
      }
    };
    box.addEventListener('dragover', over);
    box.addEventListener('dragleave', leave);
    box.addEventListener('drop', drop);
    return () => {
      box.removeEventListener('dragover', over);
      box.removeEventListener('dragleave', leave);
      box.removeEventListener('drop', drop);
    };
  }, []);

  useEffect(() => {
    dropRef.currentPayload = dragPayload;
  }, [dragPayload]);

  return (
    <div className="dxp-pane">
      {loading && <div className="dxp-loading">Đang render tài liệu…</div>}
      {error && <div className="alert alert-error text-sm">{error}</div>}
      <div ref={boxRef} className="dxp-doc" />
    </div>
  );
};

export default DocxPreviewPane;
