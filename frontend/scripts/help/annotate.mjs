export async function annotate(page, marks = []) {
  await page.evaluate((marks) => {
    document.querySelectorAll('[data-help-mark]').forEach((e) => e.remove());
    const resolve = (m) => {
      if (m.selector) return document.querySelector(m.selector);
      if (m.text) {
        const pool = m.tag
          ? [...document.querySelectorAll(m.tag)]
          : [...document.querySelectorAll('button, a, [role="button"], h1, h2, h3, span, div')];
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
        return pool.find((e) => norm(e.textContent) === m.text)
          || pool.find((e) => norm(e.textContent).includes(m.text));
      }
      return null;
    };
    marks.forEach((m) => {
      const el = resolve(m);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const pad = m.pad != null ? m.pad : 6;
      const color = m.color || '#e11d48';
      const box = document.createElement('div');
      box.setAttribute('data-help-mark', '1');
      const radius = m.shape === 'circle' ? '9999px' : (m.shape === 'ellipse' ? '50%' : '8px');
      box.style.cssText = `position:fixed;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border:3px solid ${color};border-radius:${radius};box-shadow:0 0 0 2px rgba(255,255,255,0.7),0 0 10px rgba(225,29,72,0.5);z-index:99998;pointer-events:none;box-sizing:border-box;`;
      document.body.appendChild(box);
      if (m.label) {
        const badge = document.createElement('div');
        badge.setAttribute('data-help-mark', '1');
        badge.textContent = m.label;
        badge.style.cssText = `position:fixed;left:${r.left - 14}px;top:${r.top - 16}px;min-width:24px;height:24px;padding:0 6px;border-radius:12px;background:${color};color:#fff;font:700 13px/24px Arial,sans-serif;text-align:center;z-index:99999;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.35);`;
        document.body.appendChild(badge);
      }
      if (m.arrow) {
        const len = 64;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let x1, y1, x2, y2;
        if (m.arrow === 'left') { x1 = r.left - len; y1 = cy; x2 = r.left - pad; y2 = cy; }
        else if (m.arrow === 'right') { x1 = r.right + len; y1 = cy; x2 = r.right + pad; y2 = cy; }
        else if (m.arrow === 'bottom') { x1 = cx; y1 = r.bottom + len; x2 = cx; y2 = r.bottom + pad; }
        else { x1 = cx; y1 = r.top - len; x2 = cx; y2 = r.top - pad; }
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('data-help-mark', '1');
        svg.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:99997;pointer-events:none;';
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', color); line.setAttribute('stroke-width', '4'); line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const hx1 = x2 + 22 * Math.cos(ang + Math.PI - 0.4), hy1 = y2 + 22 * Math.sin(ang + Math.PI - 0.4);
        const hx2 = x2 + 22 * Math.cos(ang + Math.PI + 0.4), hy2 = y2 + 22 * Math.sin(ang + Math.PI + 0.4);
        const head = document.createElementNS(ns, 'path');
        head.setAttribute('d', `M${x2},${y2} L${hx1},${hy1} L${hx2},${hy2} Z`);
        head.setAttribute('fill', color);
        svg.appendChild(head);
        document.body.appendChild(svg);
      }
    });
  }, marks);
}

export async function clearMarks(page) {
  await page.evaluate(() => document.querySelectorAll('[data-help-mark]').forEach((e) => e.remove()));
}
