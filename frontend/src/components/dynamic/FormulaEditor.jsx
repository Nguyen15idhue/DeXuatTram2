import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { formulaService } from '../../services/api';
import { formatNumber, NUMBER_FORMAT_OPTIONS } from '../../utils/formatNumber';

function CollapsibleSection({ title, defaultOpen = true, count, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`collapsible-section ${open ? 'open' : 'closed'}`}>
      <button type="button" className="collapsible-header" onClick={() => setOpen(!open)}>
        <span className="collapsible-arrow">{open ? '▾' : '▸'}</span>
        <span className="collapsible-title">{title}</span>
        {count !== undefined && <span className="collapsible-count">{count}</span>}
      </button>
      {open && <div className="collapsible-content">{children}</div>}
    </div>
  );
}

const FUNCTION_CATEGORIES = [
  {
    name: 'Toán học',
    functions: [
      { name: 'ROUNDUP', label: 'ROUNDUP(x, d)', desc: 'Làm tròn lên' },
      { name: 'ROUNDDOWN', label: 'ROUNDDOWN(x, d)', desc: 'Làm tròn xuống' },
      { name: 'MOD', label: 'MOD(a, b)', desc: 'Phần dư' },
      { name: 'AVERAGE', label: 'AVERAGE(...)', desc: 'Trung bình' },
    ]
  },
  {
    name: 'Logic',
    functions: [
      { name: 'IF', label: 'IF(cond, true, false)', desc: 'Điều kiện' },
      { name: 'AND', label: 'AND(...)', desc: 'Và' },
      { name: 'OR', label: 'OR(...)', desc: 'Hoặc' },
      { name: 'NOT', label: 'NOT(x)', desc: 'Phủ định' },
      { name: 'IFERROR', label: 'IFERROR(val, fallback)', desc: 'Xử lý lỗi' },
    ]
  },
  {
    name: 'Đếm / Tổng',
    functions: [
      { name: 'COUNT', label: 'COUNT(...)', desc: 'Đếm số' },
      { name: 'COUNTA', label: 'COUNTA(...)', desc: 'Đếm không trống' },
      { name: 'COUNTIF', label: 'COUNTIF(arr, criteria)', desc: 'Đếm nếu' },
      { name: 'SUMIF', label: 'SUMIF(arr, criteria)', desc: 'Tổng nếu' },
    ]
  },
  {
    name: 'Chuỗi',
    functions: [
      { name: 'CONCAT', label: 'CONCAT(...)', desc: 'Nối chuỗi' },
      { name: 'LEN', label: 'LEN(s)', desc: 'Độ dài' },
      { name: 'LEFT', label: 'LEFT(s, n)', desc: 'Lấy trái' },
      { name: 'RIGHT', label: 'RIGHT(s, n)', desc: 'Lấy phải' },
      { name: 'UPPER', label: 'UPPER(s)', desc: 'Viết hoa' },
      { name: 'LOWER', label: 'LOWER(s)', desc: 'Viết thường' },
      { name: 'TRIM', label: 'TRIM(s)', desc: 'Xóa khoảng trắng' },
      { name: 'LPAD', label: 'LPAD(s, len, ch)', desc: 'Thêm trái' },
      { name: 'RPAD', label: 'RPAD(s, len, ch)', desc: 'Thêm phải' },
    ]
  },
  {
    name: 'Ngày tháng',
    functions: [
      { name: 'YEAR', label: 'YEAR(date)', desc: 'Năm' },
      { name: 'MONTH', label: 'MONTH(date)', desc: 'Tháng' },
      { name: 'DAY', label: 'DAY(date)', desc: 'Ngày' },
      { name: 'TODAY', label: 'TODAY()', desc: 'Hôm nay' },
      { name: 'NOW', label: 'NOW()', desc: 'Thời gian hiện tại' },
      { name: 'DATE', label: 'DATE(y, m, d)', desc: 'Tạo ngày' },
    ]
  },
];

const POST_METADATA = [
  { key: 'id', label: '{id}', desc: 'ID bản ghi' },
  { key: 'entity', label: '{entity}', desc: 'Tên entity' },
  { key: 'base_url', label: '{base_url}', desc: 'URL frontend' },
  { key: 'created_at', label: '{created_at}', desc: 'Thời gian tạo' },
  { key: 'user_id', label: '{user_id}', desc: 'ID người tạo' },
  { key: 'user_email', label: '{user_email}', desc: 'Email người tạo' },
];

const OUTPUT_TYPES = [
  { value: 'auto', label: 'Tự phát hiện' },
  { value: 'number', label: 'Số' },
  { value: 'text', label: 'Chuỗi' },
  { value: 'url', label: 'URL / Link' },
];

export default function FormulaEditor({ value, onChange, allFields = [] }) {
  const { token } = useAuth();
  const textareaRef = useRef(null);
  const [validation, setValidation] = useState({ valid: null, error: null });
  const [preview, setPreview] = useState(null);
  const [showFunctions, setShowFunctions] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const [autocomplete, setAutocomplete] = useState({ visible: false, suggestions: [], selectedIndex: 0, start: 0, end: 0 });
  const [functionHint, setFunctionHint] = useState(null);

  const config = value || { expression: '', referencedFields: [], compute_mode: 'pre', outputType: 'auto', outputFormat: '', decimalPlaces: 0, unit: '', label: '' };

  const updateConfig = useCallback((patch) => {
    onChange({ ...config, ...patch });
  }, [config, onChange]);

  const ALL_SUGGESTIONS = useMemo(() => {
    const fieldSuggestions = allFields.map(f => ({ text: f.key, label: f.label || f.key, type: 'field', fieldType: f.type }));
    const funcSuggestions = FUNCTION_CATEGORIES.flatMap(cat => cat.functions.map(fn => ({ text: fn.name, label: fn.desc, type: 'function', placeholder: { IF: 'condition, trueVal, falseVal', CONCAT: "'text1', 'text2'", COUNTIF: 'arr, criteria', SUMIF: 'arr, criteria', COUNT: '1, 2, 3', COUNTA: "1, 'a', ''", AVERAGE: '10, 20, 30', ROUNDUP: '3.14, 2', ROUNDDOWN: '3.99, 1', MOD: '10, 3', LEN: "'Hello'", LEFT: "'Hello', 3", RIGHT: "'Hello', 3", UPPER: "'hello'", LOWER: "'HELLO'", TRIM: "'  hi  '", LPAD: '42, 5, "0"', RPAD: "'hi', 5, '.'", YEAR: "'2026-09-01'", MONTH: "'2026-09-01'", DAY: "'2026-09-01'", TODAY: '', NOW: '', DATE: '2026, 9, 1' }[fn.name] || '' })));
    const metaSuggestions = config.compute_mode === 'post' ? POST_METADATA.map(m => ({ text: m.label, label: m.desc, type: 'metadata' })) : [];
    return [...funcSuggestions, ...fieldSuggestions, ...metaSuggestions];
  }, [allFields, config.compute_mode]);

  const getWordAtCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return null;
    const pos = ta.selectionStart;
    const expr = config.expression;
    let start = pos;
    while (start > 0 && /[a-zA-Z0-9_{]/.test(expr[start - 1])) start--;
    const word = expr.substring(start, pos);
    if (word.length < 1) return null;
    return { word: word.toLowerCase(), start, end: pos };
  }, [config.expression]);

  const filterSuggestions = useCallback((word) => {
    if (!word) return [];
    return ALL_SUGGESTIONS.filter(s => s.text.toLowerCase().includes(word)).slice(0, 10);
  }, [ALL_SUGGESTIONS]);

  const applySuggestion = useCallback((suggestion) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end } = autocomplete;
    let insertStr;
    if (suggestion.type === 'function') {
      const name = suggestion.text;
      const n = { IF: 2, CONCAT: 2, COUNTIF: 1, SUMIF: 1, COUNT: 4, COUNTA: 2, AVERAGE: 2, ROUNDUP: 1, ROUNDDOWN: 1, MOD: 1, DATE: 2 }[name] ?? 0;
      const inner = n > 0 ? ' , '.repeat(n).trimStart() : '';
      insertStr = `${name}(${inner})`;
      setFunctionHint(FUNCTION_HINTS[name] || `${name}(...)`);
    } else {
      insertStr = suggestion.text;
    }
    const newVal = config.expression.slice(0, start) + insertStr + config.expression.slice(end);
    updateConfig({ expression: newVal });
    setAutocomplete({ visible: false, suggestions: [], selectedIndex: 0, start: 0, end: 0 });
    setTimeout(() => {
      ta.focus();
      const cursorPos = suggestion.type === 'function' ? start + suggestion.text.length + 1 : start + insertStr.length;
      ta.selectionStart = ta.selectionEnd = cursorPos;
    }, 0);
  }, [autocomplete, config.expression, updateConfig]);

  const handleKeyDown = useCallback((e) => {
    if (!autocomplete.visible) return;
    const { suggestions, selectedIndex } = autocomplete;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAutocomplete(prev => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % suggestions.length }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAutocomplete(prev => ({ ...prev, selectedIndex: (prev.selectedIndex - 1 + suggestions.length) % suggestions.length }));
    } else if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      applySuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setAutocomplete(prev => ({ ...prev, visible: false }));
    }
  }, [autocomplete, applySuggestion]);

  const insertText = useCallback((text) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = config.expression.slice(0, start) + text + config.expression.slice(end);
    updateConfig({ expression: newVal });
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + text.length;
    }, 0);
  }, [config.expression, updateConfig]);

  const insertField = useCallback((key) => {
    insertText(key);
  }, [insertText]);

  const FUNCTION_HINTS = {
    IF: 'IF(điều kiện, giá trị nếu đúng, giá trị nếu sai)',
    CONCAT: 'CONCAT("text1", "text2", ...)',
    COUNTIF: 'COUNTIF(mảng, điều kiện)',
    SUMIF: 'SUMIF(mảng, điều kiện)',
    COUNT: 'COUNT(1, 2, 3, ...)',
    COUNTA: 'COUNTA(1, "a", "", ...)',
    AVERAGE: 'AVERAGE(10, 20, 30, ...)',
    ROUNDUP: 'ROUNDUP(số, số chữ số thập phân)',
    ROUNDDOWN: 'ROUNDDOWN(số, số chữ số thập phân)',
    MOD: 'MOD(chia, chia)',
    LEN: 'LEN("chuỗi")',
    LEFT: 'LEFT("chuỗi", số ký tự)',
    RIGHT: 'RIGHT("chuỗi", số ký tự)',
    UPPER: 'UPPER("chuỗi")',
    LOWER: 'LOWER("chuỗi")',
    TRIM: 'TRIM(" chuỗi ")',
    LPAD: 'LPAD("chuỗi", độ dài, ký tự)',
    RPAD: 'RPAD("chuỗi", độ dài, ký tự)',
    YEAR: 'YEAR("2026-09-01")',
    MONTH: 'MONTH("2026-09-01")',
    DAY: 'DAY("2026-09-01")',
    TODAY: 'TODAY()',
    NOW: 'NOW()',
    DATE: 'DATE(năm, tháng, ngày)',
  };

  const insertFunction = useCallback((name) => {
    const hint = FUNCTION_HINTS[name] || `${name}(...)`;
    const commaCounts = { IF: 2, CONCAT: 2, COUNTIF: 1, SUMIF: 1, COUNT: 4, COUNTA: 2, AVERAGE: 2, ROUNDUP: 1, ROUNDDOWN: 1, MOD: 1, DATE: 2 };
    const n = commaCounts[name] ?? 0;
    const inner = n > 0 ? ' , '.repeat(n).trimStart() : '';
    insertText(`${name}(${inner})`);
    setFunctionHint(hint);
    setShowFunctions(false);
  }, [insertText]);

  const insertOperator = useCallback((op) => {
    insertText(op);
  }, [insertText]);

  const insertMetadata = useCallback((varName) => {
    insertText(varName);
  }, [insertText]);

  const getReferencedFields = useCallback((expression) => {
    if (!expression) return [];
    const fieldKeys = new Set(allFields.map(f => f.key));
    const words = expression.match(/[a-zA-Z_]\w*/g) || [];
    return [...new Set(words)].filter(w => fieldKeys.has(w));
  }, [allFields]);

  useEffect(() => {
    if (!config.expression) {
      setValidation({ valid: null, error: null });
      setPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const fields = allFields.map(f => ({ key: f.key, label: f.label || f.key }));
        const resp = await formulaService.validate(config.expression, fields, token);
        if (resp.success) {
          setValidation(resp.data);
          updateConfig({ referencedFields: getReferencedFields(config.expression) });
        }
      } catch {
        setValidation({ valid: false, error: 'Không thể validate' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [config.expression, allFields, token, getReferencedFields, updateConfig]);

  const handlePreview = async () => {
    if (!config.expression) return;
    try {
      const scope = {};
      allFields.filter(f => config.referencedFields?.includes(f.key)).forEach(f => {
        scope[f.key] = f.type === 'number' ? 100 : 'sample';
      });
      if (config.compute_mode === 'post') {
        const resp = await formulaService.previewPost(config.expression, { id: 1, entity: 'test', base_url: window.location.origin, created_at: new Date().toISOString(), user_id: 1, user_email: 'test@example.com' }, token);
        if (resp.success) setPreview(resp.data.result);
      } else {
        const resp = await formulaService.preview(config.expression, scope, token);
        if (resp.success) setPreview(resp.data.result);
      }
    } catch {
      setPreview('Lỗi preview');
    }
  };

  const handleExpressionChange = (e) => {
    updateConfig({ expression: e.target.value });
    setFunctionHint(null);
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const expr = e.target.value;
    let start = pos;
    while (start > 0 && /[a-zA-Z0-9_{]/.test(expr[start - 1])) start--;
    const word = expr.substring(start, pos).toLowerCase();
    if (word.length >= 1) {
      const matches = ALL_SUGGESTIONS.filter(s => s.text.toLowerCase().includes(word)).slice(0, 10);
      setAutocomplete({ visible: matches.length > 0, suggestions: matches, selectedIndex: 0, start, end: pos });
    } else {
      setAutocomplete(prev => ({ ...prev, visible: false }));
    }
  };

  const formatResult = (result) => {
    if (result === null || result === undefined) return '—';
    if (config.outputType === 'number' || (config.outputType === 'auto' && typeof result === 'number')) {
      return formatNumber(result, { format: config.numberFormat || 'plain', decimalPlaces: config.decimalPlaces, unit: config.unit });
    }
    return String(result);
  };

  const numberFields = allFields.filter(f => f.type === 'number');
  const textFields = allFields.filter(f => ['text', 'textarea', 'select', 'multiselect'].includes(f.type));

  return (
    <div className="formula-editor">
      <div className="formula-editor-header">
        <label>Công thức tính toán</label>
        <div className="compute-mode-selector">
          <label className={`radio-label ${config.compute_mode === 'pre' ? 'active' : ''}`}>
            <input type="radio" name="compute_mode" value="pre" checked={config.compute_mode === 'pre'} onChange={() => updateConfig({ compute_mode: 'pre' })} />
            Tính trước khi lưu
          </label>
          <label className={`radio-label ${config.compute_mode === 'post' ? 'active' : ''}`}>
            <input type="radio" name="compute_mode" value="post" checked={config.compute_mode === 'post'} onChange={() => updateConfig({ compute_mode: 'post' })} />
            Tính sau khi lưu
          </label>
        </div>
      </div>

      {config.compute_mode === 'post' && (
        <CollapsibleSection title="Biến metadata" defaultOpen={true} count={POST_METADATA.length}>
          <div className="items-grid-2">
            {POST_METADATA.map(m => (
              <button key={m.key} type="button" className="metadata-btn" onClick={() => insertMetadata(m.label)} title={m.desc}>
                {m.label}
              </button>
            ))}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title={`Trường số (${numberFields.length})`} defaultOpen={true} count={numberFields.length}>
        <div className="items-grid-2">
          {numberFields.map(f => (
            <button key={f.key} type="button" className="field-btn number" onClick={() => insertField(f.key)} title={f.label || f.key}>
              {f.label || f.key}
            </button>
          ))}
          {numberFields.length === 0 && <span className="empty-hint">Không có trường số</span>}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={`Trường text (${textFields.length})`} defaultOpen={true} count={textFields.length}>
        <div className="items-grid-2">
          {textFields.map(f => (
            <button key={f.key} type="button" className="field-btn text" onClick={() => insertField(f.key)} title={f.label || f.key}>
              {f.label || f.key}
            </button>
          ))}
          {textFields.length === 0 && <span className="empty-hint">Không có trường text</span>}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Phép toán & Hàm" defaultOpen={true} count={9}>
        <div className="operators-grid-3">
          {['(', ')', '+', '-', '*', '/', '^', ',', '>'].map(op => (
            <button key={op} type="button" className="operator-btn" onClick={() => insertOperator(op)}>
              {op}
            </button>
          ))}
          <div className="functions-dropdown-wrapper">
            <button type="button" className="operator-btn functions-toggle" onClick={() => setShowFunctions(!showFunctions)}>
              fn ▾
            </button>
            {showFunctions && (
              <div className="functions-dropdown">
                <div className="functions-tabs">
                  {FUNCTION_CATEGORIES.map((cat, i) => (
                    <button key={i} type="button" className={`tab ${i === activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(i)}>
                      {cat.name}
                    </button>
                  ))}
                </div>
                <div className="functions-list">
                  {FUNCTION_CATEGORIES[activeCategory].functions.map(fn => (
                    <button key={fn.name} type="button" className="function-item" onClick={() => insertFunction(fn.name)} title={fn.desc}>
                      <span className="fn-name">{fn.name}</span>
                      <span className="fn-desc">{fn.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      <div className="formula-textarea-wrapper">
        <textarea
          ref={textareaRef}
          className={`formula-textarea ${validation.valid === true ? 'valid' : validation.valid === false ? 'invalid' : ''}`}
          value={config.expression}
          onChange={handleExpressionChange}
          onKeyDown={handleKeyDown}
          placeholder="VD: price * quantity * (1 - discount)"
          rows={3}
          spellCheck={false}
        />
        {autocomplete.visible && autocomplete.suggestions.length > 0 && (
          <div className="autocomplete-dropdown">
            {autocomplete.suggestions.map((s, i) => (
              <div
                key={`${s.type}-${s.text}`}
                className={`autocomplete-item ${i === autocomplete.selectedIndex ? 'selected' : ''} type-${s.type}`}
                onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                onMouseEnter={() => setAutocomplete(prev => ({ ...prev, selectedIndex: i }))}
              >
                <span className="ac-text">{s.text}</span>
                <span className="ac-type">{s.type === 'field' ? `#${s.fieldType}` : s.type === 'function' ? '()' : 'var'}</span>
                <span className="ac-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}
        {validation.error && <div className="formula-error">{validation.error}</div>}
        {validation.valid === true && <div className="formula-valid">Cú pháp hợp lệ</div>}
        {functionHint && <div className="function-hint">💡 {functionHint}</div>}
      </div>

      <div className="formula-actions">
        <button type="button" className="btn-preview" onClick={handlePreview} disabled={!config.expression}>
          Xem trước kết quả
        </button>
        {preview !== null && (
          <div className="formula-preview-result">
            <strong>Kết quả:</strong> {formatResult(preview)}
          </div>
        )}
      </div>

      <div className="formula-output-config">
        <h4>Cấu hình hiển thị kết quả</h4>
        <div className="output-config-grid">
          <div className="config-field">
            <label>Loại kết quả</label>
            <select value={config.outputType} onChange={(e) => updateConfig({ outputType: e.target.value })}>
              {OUTPUT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {config.outputType === 'number' && (
            <>
              <div className="config-field">
                <label>Định dạng</label>
                <select value={config.numberFormat || 'plain'} onChange={(e) => updateConfig({ numberFormat: e.target.value })}>
                  {NUMBER_FORMAT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="config-field">
                <label>Số thập phân</label>
                <input type="number" min="0" max="10" value={config.decimalPlaces || 0} onChange={(e) => updateConfig({ decimalPlaces: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="config-field">
                <label>Đơn vị</label>
                <input type="text" value={config.unit || ''} onChange={(e) => updateConfig({ unit: e.target.value })} placeholder="VND, %, kg..." />
              </div>
            </>
          )}
          {config.outputType === 'url' && (
            <div className="config-field">
              <label>Text hiển thị link</label>
              <input type="text" value={config.label || ''} onChange={(e) => updateConfig({ label: e.target.value })} placeholder="Xem chi tiết" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
