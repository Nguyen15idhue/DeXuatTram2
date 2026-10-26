import { useMemo, useState } from 'react';
import { Search, Database, ChevronRight, ChevronDown } from 'lucide-react';

export default function ReportDataSourcePanel({ catalog, onPickField }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('leads');

  const datasets = useMemo(() => Object.entries(catalog || {})
    .map(([key, ds]) => ({ key, ...ds })), [catalog]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return datasets;
    return datasets.filter((d) => d.label.toLowerCase().includes(kw));
  }, [datasets, q]);

  return (
    <div className="re-ds">
      <div className="re-search">
        <Search size={14} />
        <input placeholder="Tìm nguồn dữ liệu…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 && <div className="re-hint">Không có nguồn dữ liệu.</div>}

      {filtered.map((d) => {
        const isOpen = open === d.key;
        const dims = Object.entries(d.dimensions || {});
        const mets = Object.entries(d.metrics || {});
        return (
          <div key={d.key} className={`re-ds-item ${isOpen ? 'open' : ''}`}>
            <button type="button" className="re-ds-head" onClick={() => setOpen(isOpen ? null : d.key)}>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Database size={14} />
              <span className="nm">{d.label}</span>
              <span className="conn">● Đã kết nối</span>
            </button>
            {isOpen && (
              <div className="re-ds-body">
                <div className="re-fgroup">Chiều phân tích (dimension)</div>
                {dims.map(([k, f]) => (
                  <button key={k} type="button" className="re-fitem" onClick={() => onPickField && onPickField(d.key, k, 'dim')}>
                    <span className="ab">Abc</span>{f.label}<span className="ft">{k}</span>
                  </button>
                ))}
                <div className="re-fgroup">Chỉ số (metric)</div>
                {mets.map(([k, f]) => (
                  <button key={k} type="button" className="re-fitem" onClick={() => onPickField && onPickField(d.key, k, 'metric')}>
                    <span className="ab">#</span>{f.label}<span className="ft">{k}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="re-hint">Bấm một trường để gán vào biểu đồ đang chọn (dimension hoặc metric).</div>
    </div>
  );
}
