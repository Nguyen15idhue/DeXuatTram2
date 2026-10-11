export const COLS = 12;
export const RGL_ROW_H = 80;
export const RGL_MARGIN = 12;
export const HEADER_H = 44;
export const DESIGN_W = 1200;
export const DEFAULT_H = 4;
export const SIZE_TO_W = { sm: 4, md: 6, lg: 8, full: 12 };

let widgetSeq = 0;
const widgetId = () => `w${Date.now().toString(36)}${(widgetSeq++).toString(36)}`;

const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

export const normalizeLayout = (layout, fallbackY = 0) => {
  if (!layout || typeof layout !== 'object') return { x: 0, y: fallbackY, w: 6, h: DEFAULT_H };
  return {
    x: clampInt(layout.x, 0, COLS - 1, 0),
    y: clampInt(layout.y, 0, 9999, fallbackY),
    w: clampInt(layout.w, 1, COLS, 6),
    h: clampInt(layout.h, 1, 40, DEFAULT_H),
  };
};

export const contentHeight = (layout) => {
  const h = (layout && Number(layout.h)) || DEFAULT_H;
  return Math.max(90, Math.round(h * RGL_ROW_H + (h - 1) * RGL_MARGIN - HEADER_H));
};

export const packLayout = (widgets) => {
  let x = 0;
  let y = 0;
  let rowH = 0;
  return (widgets || []).map((w) => {
    const ww = SIZE_TO_W[w.size] || 6;
    const hh = w.layout && Number.isFinite(Number(w.layout.h)) ? clampInt(w.layout.h, 1, 40, DEFAULT_H) : DEFAULT_H;
    if (x + ww > COLS) { x = 0; y += rowH; rowH = 0; }
    const layout = { x, y, w: ww, h: hh };
    x += ww;
    rowH = Math.max(rowH, hh);
    return { ...w, layout };
  });
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

export const toGridLayout = (widgets) => (widgets || []).map((w) => ({ ...(w.layout || {}), i: w.id }));

export const applyGridLayout = (widgets, grid) => {
  const map = {};
  (grid || []).forEach((g) => { if (g && g.i) map[g.i] = { x: g.x, y: g.y, w: g.w, h: g.h }; });
  return (widgets || []).map((w) => (map[w.id] ? { ...w, layout: normalizeLayout(map[w.id]) } : w));
};

const deriveType = (w) => {
  if (w.kind === 'detail') return 'detail';
  if (w.type) return w.type;
  return 'chart';
};

export const normalizeWidget = (w) => {
  if (!w || typeof w !== 'object') return null;
  const type = deriveType(w);
  const base = { id: w.id || widgetId(), type, title: w.title || '', version: 2 };
  const layout = normalizeLayout(w.layout);
  if (type === 'control') {
    return {
      ...base, layout,
      controlType: w.controlType || 'select',
      dataSourceId: w.dataSourceId || null,
      field: w.field || null,
      defaultValue: w.defaultValue === undefined ? null : w.defaultValue,
    };
  }
  if (type === 'text') {
    const vc = w.visualConfig || {};
    return { ...base, layout, visualConfig: { text: vc.text || w.title || 'Văn bản', align: vc.align || 'left', fontSize: vc.fontSize || 18 } };
  }
  if (type === 'detail') return { ...base, layout };
  const dc = w.dataConfig || {};
  const vc = w.visualConfig || {};
  return {
    ...base, layout,
    dataSourceId: w.dataSourceId || w.dataset || null,
    systemMetric: w.dataset ? null : (w.metric || null),
    dataConfig: {
      dimension: dc.dimension || w.dimension || 'stage',
      metric: dc.metric || w.metric || 'id',
      agg: dc.agg || w.agg || 'count',
      filters: Array.isArray(dc.filters) ? dc.filters.slice(0, 10) : (Array.isArray(w.filters) ? w.filters.slice(0, 10) : []),
      sort: dc.sort || w.sort || 'value_desc',
      limit: Number(dc.limit || w.limit) || 20,
    },
    visualConfig: {
      chartType: vc.chartType || w.chart || (type === 'kpi' ? 'kpi' : type === 'table' ? 'table' : 'bar'),
      palette: vc.palette || 'default',
      showLegend: vc.showLegend === undefined ? false : !!vc.showLegend,
      showLabels: vc.showLabels === undefined ? false : !!vc.showLabels,
      numberFormat: vc.numberFormat || 'plain',
    },
  };
};

export const normalizeReport = (row) => {
  const raw = Array.isArray(row && row.widgets) ? row.widgets : [];
  let widgets = raw.map(normalizeWidget).filter(Boolean);
  if (raw.some((w) => !w || !w.layout)) {
    widgets = packLayout(widgets.map((w, i) => ({ ...w, size: w.size || (raw[i] && raw[i].size) || 'md' })));
  }
  return {
    id: row && row.id,
    name: (row && row.name) || 'Báo cáo',
    page: { title: (row && row.name) || 'Báo cáo', columns: COLS, rowHeight: RGL_ROW_H },
    widgets,
  };
};

export const defaultWidget = (type) => {
  const layout = { x: 0, y: 0, w: 6, h: 4 };
  if (type === 'kpi') return { id: widgetId(), type: 'kpi', title: 'Chỉ số mới', dataSourceId: 'leads', dataConfig: { dimension: 'id', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'kpi', numberFormat: 'plain' }, layout, version: 2 };
  if (type === 'table') return { id: widgetId(), type: 'table', title: 'Bảng dữ liệu', dataSourceId: 'leads', dataConfig: { dimension: 'stage', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'table' }, layout, version: 2 };
  if (type === 'detail') return { id: widgetId(), type: 'detail', title: 'Bảng chi tiết Lead → ON', layout: { ...layout, w: 12 }, version: 2 };
  if (type === 'text') return { id: widgetId(), type: 'text', title: 'Tiêu đề', visualConfig: { text: 'TIÊU ĐỀ MỚI', align: 'left', fontSize: 18 }, layout: { ...layout, h: 2 }, version: 2 };
  if (type === 'controlDate') return { id: widgetId(), type: 'control', controlType: 'dateRange', title: 'Khoảng thời gian', layout: { ...layout, w: 4, h: 2 }, version: 2 };
  if (type === 'controlSelect') return { id: widgetId(), type: 'control', controlType: 'select', title: 'Danh mục', field: 'region', layout: { ...layout, w: 4, h: 2 }, version: 2 };
  return { id: widgetId(), type: 'chart', title: 'Biểu đồ mới', dataSourceId: 'leads', dataConfig: { dimension: 'stage', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'bar', showLegend: false, showLabels: false, numberFormat: 'plain' }, layout: { ...layout, h: 5 }, version: 2 };
};

export const AGGS = [
  ['count', 'Đếm'], ['count_distinct', 'Đếm khác nhau'], ['sum', 'Tổng'],
  ['avg', 'Trung bình'], ['min', 'Nhỏ nhất'], ['max', 'Lớn nhất'],
];

export const CHART_TYPES = [
  ['bar', 'Cột'], ['barH', 'Cột ngang'], ['line', 'Đường'],
  ['pie', 'Tròn'], ['donut', 'Donut'], ['table', 'Bảng'], ['kpi', 'Số lớn'],
];

export const mergeControlFilters = (widget, widgets, controlValues) => {
  if (!widget || !widget.dataSourceId) return [];
  const base = (widget.dataConfig && widget.dataConfig.filters) || [];
  const extra = [];
  (widgets || []).forEach((c) => {
    if (c.type !== 'control' || c.dataSourceId !== widget.dataSourceId) return;
    const val = controlValues ? controlValues[c.id] : null;
    if (val === null || val === undefined || val === '') return;
    if (c.controlType === 'select') extra.push({ key: c.field, op: '=', value: String(val) });
    if (c.controlType === 'dateRange' && val && val.from) extra.push({ key: c.field || 'created_date', op: '>=', value: String(val.from) });
    if (c.controlType === 'dateRange' && val && val.to) extra.push({ key: c.field || 'created_date', op: '<=', value: String(val.to) });
  });
  return [...base, ...extra];
};
