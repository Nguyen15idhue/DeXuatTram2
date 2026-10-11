export const SIZE_TO_W = { sm: 4, md: 6, lg: 8, full: 12 };
export const DEFAULT_H = 4;
export const GRID_COLS = 12;

let uidSeq = 0;
export const newWidgetId = () => `w${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

export const normalizeLayout = (layout, fallbackY = 0) => {
  if (!layout || typeof layout !== 'object') {
    return { x: 0, y: fallbackY, w: 6, h: DEFAULT_H };
  }
  return {
    x: clampInt(layout.x, 0, GRID_COLS - 1, 0),
    y: clampInt(layout.y, 0, 9999, fallbackY),
    w: clampInt(layout.w, 1, GRID_COLS, 6),
    h: clampInt(layout.h, 1, 30, DEFAULT_H),
  };
};

export const migrateV1toV2 = (widgets) => {
  let y = 0;
  return (widgets || []).map((w, i) => {
    const nw = { ...(w || {}) };
    if (!nw.id) nw.id = newWidgetId();
    if (!nw.layout) {
      nw.layout = { x: 0, y, w: SIZE_TO_W[nw.size] || 6, h: DEFAULT_H };
      y += DEFAULT_H;
    } else {
      nw.layout = normalizeLayout(nw.layout, y);
      y = Math.max(y, nw.layout.y + nw.layout.h);
    }
    return nw;
  });
};

export const toGridLayout = (widgets) => (widgets || []).map((w) => ({ ...(w.layout || {}), i: w.id }));

export const applyGridLayout = (widgets, grid) => {
  const map = {};
  (grid || []).forEach((g) => { if (g && g.i) map[g.i] = { x: g.x, y: g.y, w: g.w, h: g.h }; });
  return (widgets || []).map((w) => (map[w.id] ? { ...w, layout: normalizeLayout(map[w.id]) } : w));
};

export const nextLayoutY = (widgets) => {
  let y = 0;
  (widgets || []).forEach((w) => {
    const l = (w && w.layout) || {};
    const ey = (Number.isFinite(Number(l.y)) ? Number(l.y) : 0) + (Number.isFinite(Number(l.h)) ? Number(l.h) : DEFAULT_H);
    if (ey > y) y = ey;
  });
  return y;
};
