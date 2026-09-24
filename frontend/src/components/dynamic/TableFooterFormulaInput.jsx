import { useMemo, useRef, useState } from 'react';
import { buildFooterSuggestions, validateFooterFormula } from '../../utils/tableFooter';
import { normalizeForSearch } from '../../utils/searchText';

const getToken = (value, cursor) => {
  const before = String(value || '').slice(0, cursor);
  const m = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
  return { token: m ? m[1] : '', start: cursor - (m ? m[1].length : 0) };
};

const TableFooterFormulaInput = ({ value = '', onChange, columns = [], currentColKey = null, placeholder = 'VD: 20% * SUM', disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [cursor, setCursor] = useState(value.length);
  const inputRef = useRef(null);

  const validation = useMemo(
    () => validateFooterFormula(value, columns, currentColKey),
    [value, columns, currentColKey]
  );

  const suggestions = useMemo(() => buildFooterSuggestions(columns), [columns]);

  const filtered = useMemo(() => {
    const { token } = getToken(value, cursor);
    const term = normalizeForSearch(token);
    const list = term ? suggestions.filter((s) => normalizeForSearch(s.label).includes(term)) : suggestions;
    return list.slice(0, 10);
  }, [suggestions, value, cursor]);

  const syncCursor = () => {
    const el = inputRef.current;
    if (el) setCursor(el.selectionStart ?? String(value).length);
  };

  const apply = (s) => {
    const { start } = getToken(value, cursor);
    const next = String(value || '').slice(0, start) + s.insert + String(value || '').slice(cursor);
    onChange(next);
    setOpen(false);
    const caret = start + s.insert.length;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
      setCursor(caret);
    });
  };

  const onKeyDown = (e) => {
    if (!open || filtered.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      apply(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showError = !!value && !validation.valid;

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        className="form-control"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setCursor(e.target.selectionStart); setOpen(true); setHighlight(0); }}
        onFocus={() => { syncCursor(); setOpen(true); }}
        onClick={syncCursor}
        onKeyUp={syncCursor}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          fontSize: 12,
          padding: '6px 8px',
          fontFamily: 'monospace',
          background: value ? '#f1f5f9' : undefined,
          borderColor: showError ? '#dc2626' : undefined,
        }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 130, marginTop: 2,
            background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6,
            boxShadow: '0 6px 16px rgba(0,0,0,.12)', maxHeight: 200, overflow: 'auto',
          }}
        >
          {filtered.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); apply(s); }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '5px 8px', fontSize: 12, cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', gap: 8,
                background: i === highlight ? '#eef2ff' : 'transparent',
              }}
            >
              <span style={{ fontFamily: 'monospace' }}>{s.label}</span>
              {s.detail && <span style={{ color: '#94a3b8', fontSize: 11 }}>{s.detail}</span>}
            </div>
          ))}
        </div>
      )}
      {showError && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>{validation.error}</div>}
    </div>
  );
};

export default TableFooterFormulaInput;
