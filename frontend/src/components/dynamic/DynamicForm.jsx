import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dynamicService, dataListService, fieldDefinitionService, formService, geocodeService } from '../../services/api';
import DynamicField from './DynamicField';
import { create, all } from 'mathjs';
import { parseFormattedNumber, formatNumber, parseLeadingNumber } from '../../utils/formatNumber';
import { getDataListLabel } from '../../utils/dataListLabel';
import { fetchDataList } from '../../utils/dataListCache';

const math = create(all);
const customFunctions = {
  ROUNDUP: (x, d = 0) => Math.ceil(x * Math.pow(10, d)) / Math.pow(10, d),
  ROUNDDOWN: (x, d = 0) => Math.floor(x * Math.pow(10, d)) / Math.pow(10, d),
  MOD: (a, b) => a % b,
  IF: (condition, trueVal, falseVal) => condition ? trueVal : falseVal,
  AND: (...args) => args.every(Boolean),
  OR: (...args) => args.some(Boolean),
  NOT: (x) => !x,
  IFERROR: (val, fallback) => (val === null || val === undefined || isNaN(val) || val === Infinity) ? fallback : val,
  COUNT: (...args) => args.filter(v => v !== null && v !== undefined && !isNaN(v)).length,
  COUNTA: (...args) => args.filter(v => v !== null && v !== undefined && v !== '').length,
  AVERAGE: (...args) => { const nums = args.flat().filter(v => v !== null && v !== undefined && !isNaN(v)); return nums.length === 0 ? 0 : nums.reduce((s, v) => s + Number(v), 0) / nums.length; },
  TABLE_SUM: (arr) => { if (!Array.isArray(arr)) return 0; return arr.reduce((s, v) => s + (Number(v) || 0), 0); },
  TABLE_AVG: (arr) => { if (!Array.isArray(arr)) return 0; const nums = arr.filter(v => v !== null && v !== undefined && !isNaN(v)); return nums.length === 0 ? 0 : nums.reduce((s, v) => s + Number(v), 0) / nums.length; },
  TABLE_MIN: (arr) => { if (!Array.isArray(arr) || arr.length === 0) return 0; const nums = arr.filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number); return nums.length === 0 ? 0 : Math.min(...nums); },
  TABLE_MAX: (arr) => { if (!Array.isArray(arr) || arr.length === 0) return 0; const nums = arr.filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number); return nums.length === 0 ? 0 : Math.max(...nums); },
  TABLE_COUNT: (arr) => { if (!Array.isArray(arr)) return 0; return arr.filter(v => v !== null && v !== undefined && v !== '').length; },
  CONCAT: (...args) => args.map(v => v ?? '').join(''),
  LEN: (s) => String(s ?? '').length,
  LEFT: (s, n = 1) => String(s ?? '').substring(0, n),
  RIGHT: (s, n = 1) => { const str = String(s ?? ''); return str.substring(str.length - n); },
  UPPER: (s) => String(s ?? '').toUpperCase(),
  LOWER: (s) => String(s ?? '').toLowerCase(),
  TRIM: (s) => String(s ?? '').trim(),
  LPAD: (s, len, ch = '0') => String(s ?? '').padStart(len, ch),
  RPAD: (s, len, ch = ' ') => String(s ?? '').padEnd(len, ch),
  YEAR: (d) => new Date(d).getFullYear(),
  MONTH: (d) => new Date(d).getMonth() + 1,
  DAY: (d) => new Date(d).getDate(),
  TODAY: () => new Date().toISOString().split('T')[0],
  NOW: () => new Date().toISOString(),
  DATE: (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
};
math.import(customFunctions, { override: false });

const parseSourceConfig = (val) => {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
};

const resolveAutoUserId = (sc, authUser) => {
  const mode = sc && sc.auto_user;
  if (mode !== 'current_user' && mode !== 'parent_sales' && mode !== 'owner_or_manager') return null;
  if (!authUser || !authUser.id) return null;
  if (mode === 'parent_sales') return authUser.parent_id || authUser.id;
  if (mode === 'owner_or_manager') {
    return ['CTV', 'NPP'].includes(authUser.role) ? (authUser.parent_id || authUser.id) : authUser.id;
  }
  return authUser.id;
};

const MAX_TAB_DEPTH = 5;

const evalVisibleWhen = (node, formData) => {
  if (!node || !node.visibleWhen || !node.visibleWhen.field) return true;
  return String(formData[node.visibleWhen.field] ?? '') === String(node.visibleWhen.value ?? '');
};

const markRows = (rowHidden, rows, visible) => {
  (rows || []).forEach((row) => {
    if (!row || !row.id) return;
    rowHidden[row.id] = rowHidden[row.id] === false ? false : !visible;
  });
};

const walkLayout = (node, visible, formData, sectionMap, pathSet, depth, isReferenced, rowHidden) => {
  if (!node || depth > MAX_TAB_DEPTH) return;
  const myVisible = isReferenced ? visible : (visible && evalVisibleWhen(node, formData));
  if (node.type === 'tabs' || Array.isArray(node.tabs)) {
    (node.tabs || []).forEach((tab) => {
      if (!tab) return;
      const tabVisible = myVisible && evalVisibleWhen(tab, formData);
      (tab.sectionRefs || []).forEach((refId) => {
        if (pathSet.has(refId)) return;
        const sec = sectionMap[refId];
        if (!sec) return;
        const next = new Set(pathSet);
        next.add(refId);
        walkLayout(sec, tabVisible, formData, sectionMap, next, depth + 1, true, rowHidden);
      });
      if (Array.isArray(tab.tabs)) {
        walkLayout(tab, tabVisible, formData, sectionMap, pathSet, depth + 1, false, rowHidden);
      }
    });
    markRows(rowHidden, node.rows, myVisible);
  } else {
    markRows(rowHidden, node.rows, myVisible);
  }
};

const computeRowHidden = (layoutConfig, formData) => {
  const rowHidden = {};
  const sections = (layoutConfig && layoutConfig.sections) || [];
  const sectionMap = {};
  sections.forEach((s) => { if (s && s.id) sectionMap[s.id] = s; });
  sections.forEach((sec) => walkLayout(sec, true, formData, sectionMap, new Set(), 1, false, rowHidden));
  return rowHidden;
};

const buildSectionMap = (layoutConfig) => {
  const sectionMap = {};
  ((layoutConfig && layoutConfig.sections) || []).forEach((s) => { if (s && s.id) sectionMap[s.id] = s; });
  return sectionMap;
};

const findTabForRow = (layoutConfig, rowId) => {
  const sectionMap = buildSectionMap(layoutConfig);
  const sections = (layoutConfig && layoutConfig.sections) || [];
  const search = (node, path, depth) => {
    if (!node || depth > MAX_TAB_DEPTH) return null;
    if (node.type === 'tabs' || Array.isArray(node.tabs)) {
      for (const tab of (node.tabs || [])) {
        if (!tab) continue;
        for (const refId of (tab.sectionRefs || [])) {
          const sec = sectionMap[refId];
          if (sec && !(sec.type === 'tabs' || Array.isArray(sec.tabs)) && (sec.rows || []).some((r) => r.id === rowId)) {
            return { path, tabId: tab.id };
          }
        }
        if (Array.isArray(tab.tabs)) {
          const found = search(tab, `${path}/${tab.id}`, depth + 1);
          if (found) return found;
        }
      }
    }
    return null;
  };
  for (const sec of sections) {
    const found = search(sec, sec.id, 1);
    if (found) return found;
  }
  return null;
};

const DynamicForm = ({ entity, formId: formIdProp, purpose, onSubmit, initialData = {}, children, guestMode = false, optionAllowlist = {} }) => {
  const { token, user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formConfig, setFormConfig] = useState(null);
  const [fields, setFields] = useState([]);
  const [allEntityFields, setAllEntityFields] = useState([]);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [dataListOptions, setDataListOptions] = useState({});
  const [resolvedFormId, setResolvedFormId] = useState(null);
  const [activeTabs, setActiveTabs] = useState({});
  const [geocoding, setGeocoding] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const formRef = useRef(null);
  const geocodeTimerRef = useRef(null);
  const geocodeSeqRef = useRef(0);

  useEffect(() => {
    if (formIdProp) { setResolvedFormId(formIdProp); return; }
    if (purpose) { resolveFormId(); return; }
  }, [entity, formIdProp, purpose]);

  const resolveFormId = async () => {
    try {
      setLoading(true);
      const res = await formService.getByEntityAndPurpose(entity, purpose);
      if (res.success && res.data) {
        setResolvedFormId(res.data.id);
      } else {
        setResolvedFormId(formIdProp || null);
      }
    } catch {
      setResolvedFormId(formIdProp || null);
    }
  };

  useEffect(() => {
    if (resolvedFormId) loadFormConfig();
  }, [resolvedFormId, authUser?.id, authUser?.parent_id]);

  const loadFormConfig = async () => {
    try {
      setLoading(true);
      const res = await dynamicService.getFormConfig(entity, resolvedFormId);
      if (res.success) {
        setFormConfig(res.data.form);
        setSubmitAttempted(false);
        setErrors({});
        const fieldList = (res.data.fields || []).map(f => {
          const cfg = f.config ? (typeof f.config === 'string' ? JSON.parse(f.config) : f.config) : {};
          const sc = parseSourceConfig(f.source_config);
          const autoUserId = f.type === 'user' ? resolveAutoUserId(sc, authUser) : null;
          return {
            ...f,
            config: cfg,
            conditions: cfg.conditions || [],
            conditionLogic: cfg.conditionLogic || 'AND',
            readonly: cfg.readonly || false,
            labelOverride: cfg.labelOverride || '',
            placeholderOverride: cfg.placeholderOverride || '',
            autoUser: sc.auto_user || 'none',
            autoUserId
          };
        });
        setFields(fieldList);
        const defaults = {};
        fieldList.forEach(f => {
          if (f.autoUserId) {
            defaults[f.key] = { id: f.autoUserId };
          } else if (initialData[f.key] !== undefined && initialData[f.key] !== null) {
            defaults[f.key] = initialData[f.key];
          } else if (f.default_value !== undefined) {
            defaults[f.key] = f.default_value;
          } else if (f.type === 'boolean') {
            defaults[f.key] = false;
          } else if (f.type === 'multiselect') {
            defaults[f.key] = [];
          } else if (f.type === 'table') {
            defaults[f.key] = [];
          } else {
            defaults[f.key] = '';
          }
        });
        setFormData(defaults);

        const dlIdSet = new Set(fieldList.filter(f => f.data_list_id).map(f => f.data_list_id));
        fieldList.forEach(f => {
          if (f.type !== 'table') return;
          const tc = (() => {
            if (!f.source_config) return {};
            if (typeof f.source_config === 'object') return f.source_config;
            try { return JSON.parse(f.source_config); } catch { return {}; }
          })();
          (tc.columns || []).forEach(col => { if (col.data_list_id) dlIdSet.add(col.data_list_id); });
        });
        const dlIds = [...dlIdSet];
        if (dlIds.length > 0) {
          const dlMap = {};
          await Promise.all(dlIds.map(async (dlId) => {
            try {
              const dlData = await fetchDataList(dlId);
              if (dlData) {
                const cols = dlData.columns_config || [];
                const rows = dlData.rows || [];
                const tree = {};
                const unique = {};
                const seen = {};
                cols.forEach(col => { tree[col.key] = {}; unique[col.key] = []; seen[col.key] = new Set(); });
                const firstCol = cols[0];
                rows.forEach(r => {
                  const data = r.data || {};
                  cols.forEach(col => {
                    const val = data[col.key];
                    if (!val) return;
                    if (!tree[col.key][val]) tree[col.key][val] = [];
                    tree[col.key][val].push({
                      value: firstCol ? (data[firstCol.key] || '') : '',
                      label: firstCol ? (data[firstCol.key] || '') : '',
                      _raw: data
                    });
                    if (!seen[col.key].has(val)) { seen[col.key].add(val); unique[col.key].push(val); }
                  });
                });
                dlMap[dlId] = { tree, unique };
              }
            } catch (err) { console.error('[DynamicForm] Error loading data list', dlId, err); }
          }));
          setDataListOptions(dlMap);
        }
      }
    } catch {
      setError('Lỗi tải cấu hình form');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!entity || fields.length === 0) return;
    const hasTable = fields.some(f => f.type === 'table');
    if (!hasTable) return;
    const loadAll = async () => {
      try {
        const res = await fieldDefinitionService.getAll(`entity=${entity}&limit=100`, token);
        if (res.success) setAllEntityFields(res.data || []);
      } catch {}
    };
    loadAll();
  }, [entity, fields, token]);

  useEffect(() => {
    if (!initialData || fields.length === 0) return;
    setFormData(prev => {
      let changed = false;
      const next = { ...prev };
      fields.forEach(f => {
        if (initialData[f.key] !== undefined && initialData[f.key] !== null && initialData[f.key] !== prev[f.key]) {
          next[f.key] = initialData[f.key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [initialData, fields]);

  const handleChange = useCallback((key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  }, []);

  useEffect(() => {
    if (entity !== 'station_proposals' && entity !== 'stations') return;
    if (fields.length === 0) return;
    const keySet = new Set(fields.map(f => f.key));
    if (!keySet.has('latitude') || !keySet.has('longitude')) return;
    const targets = ['address', 'province', 'xa_phuong', 'ma_tinh', 'vung_mien'].filter(k => keySet.has(k));
    if (targets.length === 0) return;

    const lat = parseFloat(formData.latitude);
    const lng = parseFloat(formData.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';
    if (!targets.some(k => isEmpty(formData[k]))) return;

    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    const seq = ++geocodeSeqRef.current;
    geocodeTimerRef.current = setTimeout(async () => {
      setGeocoding(true);
      try {
        const res = await geocodeService.reverse(lat, lng);
        if (seq !== geocodeSeqRef.current) return;
        const data = res && res.data;
        if (!data || !data.found) return;
        const admin = data.admin || {};
        setFormData(prev => {
          const next = { ...prev };
          const empty = (v) => v === undefined || v === null || String(v).trim() === '';
          const addr = data.address || data.formatted;
          if (keySet.has('address') && empty(prev.address) && addr) next.address = addr;
          if (keySet.has('province') && empty(prev.province) && admin.province) next.province = admin.province;
          if (keySet.has('xa_phuong') && empty(prev.xa_phuong) && admin.xa_phuong) next.xa_phuong = admin.xa_phuong;
          if (keySet.has('ma_tinh') && empty(prev.ma_tinh) && admin.ma_tinh) next.ma_tinh = admin.ma_tinh;
          if (keySet.has('vung_mien') && empty(prev.vung_mien) && admin.vung_mien) next.vung_mien = admin.vung_mien;
          return next;
        });
      } catch { /* bỏ qua lỗi geocode */ } finally {
        if (seq === geocodeSeqRef.current) setGeocoding(false);
      }
    }, 700);

    return () => { if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current); };
  }, [entity, fields, formData.latitude, formData.longitude]);

  const parentFieldMap = useMemo(() => {
    const map = {};
    fields.forEach(f => {
      if (f.parent_field) {
        if (!map[f.parent_field]) map[f.parent_field] = [];
        map[f.parent_field].push(f.key);
      }
    });
    return map;
  }, [fields]);

  const getParentValue = useCallback((parentCol) => {
    if (formData[parentCol] !== undefined) return formData[parentCol];
    const parentFieldDef = fields.find(f => f.data_list_column === parentCol && f.key !== parentCol);
    if (parentFieldDef) return formData[parentFieldDef.key];
    return undefined;
  }, [fields, formData]);

  const prevFormDataRef = useRef(formData);

  useEffect(() => {
    let changed = false;
    const next = { ...formData };

    Object.keys(parentFieldMap).forEach(parentKey => {
      const childKeys = parentFieldMap[parentKey];
      childKeys.forEach(childKey => {
        const childField = fields.find(f => f.key === childKey);
        if (childField && childField.type === 'select') {
          const parentVal = getParentValue(parentKey);
          if (parentVal) {
            if (next[childKey] && !isOptionValidForParent(childField, parentVal, next[childKey])) {
              next[childKey] = '';
              changed = true;
            }
          }
        }
      });
    });

    fields.forEach(f => {
      if (f.type === 'formula' && f.key) {
        const val = computeFormula(f);
        if (next[f.key] !== val) {
          next[f.key] = val;
          changed = true;
        }
      }
    });

    if (changed) {
      setFormData(next);
    }
    prevFormDataRef.current = next;
  }, [formData, parentFieldMap, fields]);

  const isOptionValidForParent = (childField, parentVal, optionVal) => {
    if (!childField.data_list_id) return true;
    const { tree } = dataListOptions[childField.data_list_id] || {};
    if (!tree) return true;
    const col = childField.data_list_column;
    if (!col) return true;
    const parentCol = childField.parent_field;
    if (parentCol && tree[parentCol] && tree[parentCol][parentVal]) {
      return tree[parentCol][parentVal].some(r => r._raw?.[col] === optionVal);
    }
    return true;
  };

  const getFilteredOptions = (field) => {
    if (field.data_list_id && dataListOptions[field.data_list_id]) {
      const { tree, unique } = dataListOptions[field.data_list_id];
      const col = field.data_list_column;
      if (!col || !tree[col]) return [];

      if (field.parent_field) {
        const parentVal = getParentValue(field.parent_field);
        if (!parentVal) return [];
        const parentCol = field.parent_field;
        if (parentCol && tree[parentCol] && tree[parentCol][parentVal]) {
          const parentRows = tree[parentCol][parentVal];
          const seen = new Set();
          return parentRows.filter(r => {
            const v = r._raw?.[col];
            if (v && !seen.has(v)) { seen.add(v); return true; }
            return false;
          }).map(r => ({ value: r._raw[col], label: getDataListLabel(field, r._raw, r._raw[col]), _raw: r._raw }));
        }
        return [];
      }

      return (unique[col] || []).map(v => {
        const raw = tree[col][v] && tree[col][v][0] ? tree[col][v][0]._raw : null;
        return { value: v, label: getDataListLabel(field, raw, v) };
      });
    }

    if (!field.parent_field || !field.source_config) return field.options || [];
    const parentVal = getParentValue(field.parent_field);
    if (!parentVal) return [];
    try {
      const sc = typeof field.source_config === 'string' ? JSON.parse(field.source_config) : field.source_config;
      if (sc[parentVal]) {
        return (field.options || []).filter(o => sc[parentVal].includes(o.value || o));
      }
      return field.options || [];
    } catch { return field.options || []; }
  };

  const computeFormula = (field) => {
    if (!field.formula_config || !field.formula_config.expression) return '';
    if (field.formula_config.compute_mode === 'post') return '';
    try {
      const scope = {};
      fields.forEach(f => {
        if (f.key !== field.key && f.type !== 'password') {
          const val = formData[f.key];
          if (val !== undefined && val !== '') {
            if (f.type === 'table' && Array.isArray(val)) {
              const tc = (() => {
                if (!f.source_config) return {};
                if (typeof f.source_config === 'object') return f.source_config;
                try { return JSON.parse(f.source_config); } catch { return {}; }
              })();
              const columns = tc.columns || [];
              const nested = {};
              for (const col of columns) {
                const colValues = val.map(r => r[col.key] ?? '');
                scope[`${f.key}.${col.key}`] = colValues;
                nested[col.key] = colValues;
              }
              scope[f.key] = nested;
            } else if (f.type === 'number' || f.type === 'formula') {
              const num = typeof val === 'number' ? val : parseFormattedNumber(val);
              scope[f.key] = isNaN(num) ? 0 : num;
            } else {
              scope[f.key] = val;
            }
          }
        }
      });
      const result = math.evaluate(field.formula_config.expression, scope);
      if (result === null || result === undefined) return '';
      if (typeof result === 'number' && !isFinite(result)) return '';
      return result;
    } catch { return ''; }
  };

  const isFieldVisible = useCallback((field) => {
    if (!field.conditions || field.conditions.length === 0) return true;
    const results = field.conditions.map(cond => {
      if (!cond.field || cond.field === '') return true;
      const val = formData[cond.field];
      const checkVal = cond.value || '';
      switch (cond.operator) {
        case '=': return String(val || '') === checkVal;
        case '!=': return String(val || '') !== checkVal;
        case 'contains': return String(val || '').toLowerCase().includes(checkVal.toLowerCase());
        case '>': return Number(val) > Number(checkVal);
        case '<': return Number(val) < Number(checkVal);
        case 'empty': return val === '' || val === null || val === undefined;
        case 'not_empty': return val !== '' && val !== null && val !== undefined;
        default: return true;
      }
    });
    return field.conditionLogic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }, [formData]);

  const validate = () => {
    const newErrors = {};
    const layoutForValidate = formConfig?.layout_config
      ? (typeof formConfig.layout_config === 'string' ? JSON.parse(formConfig.layout_config) : formConfig.layout_config)
      : null;
    const sectionHidden = computeRowHidden(layoutForValidate, formData);
    fields.forEach(f => {
      if (f.config && f.config.rowId && sectionHidden[f.config.rowId]) return;
      if (!isFieldVisible(f)) return;
      const isRequired = f.required;
      if (isRequired) {
        const val = formData[f.key];
        if (val === '' || val === null || val === undefined) {
          const label = f.labelOverride || f.label;
          newErrors[f.key] = `${label} là bắt buộc`;
        }
        if (f.type === 'multiselect' && Array.isArray(val) && val.length === 0) {
          const label = f.labelOverride || f.label;
          newErrors[f.key] = `${label} là bắt buộc`;
        }
        if (f.type === 'table' && Array.isArray(val) && val.length === 0) {
          const label = f.labelOverride || f.label;
          newErrors[f.key] = `${label} phải có ít nhất 1 dòng`;
        }
      }
      if (f.type === 'table' && Array.isArray(formData[f.key])) {
        const tc = (() => {
          if (!f.source_config) return {};
          if (typeof f.source_config === 'object') return f.source_config;
          try { return JSON.parse(f.source_config); } catch { return {}; }
        })();
        const rows = formData[f.key];
        if (tc.min_rows != null && rows.length < tc.min_rows) {
          newErrors[f.key] = `${f.label || f.key} phải có ít nhất ${tc.min_rows} dòng`;
        }
        if (tc.max_rows != null && rows.length > tc.max_rows) {
          newErrors[f.key] = `${f.label || f.key} không được quá ${tc.max_rows} dòng`;
        }
        const reqCols = (tc.columns || []).filter(c => c && c.required);
        if (reqCols.length > 0 && !newErrors[f.key]) {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i] || {};
            const missing = reqCols.filter(c => {
              const v = row[c.key];
              return v === '' || v === null || v === undefined;
            });
            if (missing.length > 0) {
              newErrors[f.key] = `${f.label || f.key}: dòng ${i + 1} thiếu ${missing.map(c => c.label || c.key).join(', ')}`;
              break;
            }
          }
        }
      }
    });
    setErrors(newErrors);
    const errorKeys = getOrderedErrorKeys(newErrors);
    if (errorKeys.length > 0) {
      activateTabForField(errorKeys[0], layoutForValidate);
    }
    return errorKeys;
  };

  const getOrderedErrorKeys = (errObj) => {
    const order = {};
    fields.forEach((f, i) => { order[f.key] = i; });
    return Object.keys(errObj || {}).sort((a, b) => (order[a] ?? 9999) - (order[b] ?? 9999));
  };

  const activateTabForField = (key, layout) => {
    const target = fields.find(f => f.key === key);
    const rowId = target?.config?.rowId;
    if (!rowId) return;
    const lc = layout || (formConfig?.layout_config
      ? (typeof formConfig.layout_config === 'string' ? JSON.parse(formConfig.layout_config) : formConfig.layout_config)
      : null);
    const loc = findTabForRow(lc, rowId);
    if (loc) setActiveTabs(prev => (prev[loc.path] === loc.tabId ? prev : { ...prev, [loc.path]: loc.tabId }));
  };

  const scrollToField = (key) => {
    setTimeout(() => {
      const root = formRef.current || document;
      const el = root.querySelector(`[data-field-key="${CSS.escape(key)}"]`);
      const visible = el && el.offsetParent !== null;
      const target = visible ? el : root.querySelector('[data-error-summary]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (visible) {
          const input = el.querySelector('input, select, textarea');
          if (input) input.focus({ preventScroll: true });
        }
      }
    }, 80);
  };

  const focusFirstError = (keys) => {
    if (!keys || keys.length === 0) return;
    activateTabForField(keys[0]);
    scrollToField(keys[0]);
  };

  const scrollToBanner = () => {
    setTimeout(() => {
      const banner = (formRef.current || document).querySelector('[data-error-summary],[data-error-banner]');
      if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitAttempted(true);
    const errorKeys = validate();
    if (errorKeys.length > 0) {
      scrollToBanner();
      return;
    }
    try {
      if (onSubmit) {
        await onSubmit(formData);
      }
      setSubmitAttempted(false);
    } catch (err) {
      setError(err.message || 'Lỗi lưu dữ liệu');
      scrollToBanner();
    }
  };

  if (error && !formConfig) return <div className="error-message">{error}</div>;
  if (!formConfig) return <div className="empty-state">{loading ? 'Đang tải form...' : 'Không tìm thấy form'}</div>;

  const renderField = (field) => {
    const resolvedOptions = getFilteredOptions(field);
    const displayLabel = field.labelOverride || field.label;
    const displayPlaceholder = field.placeholderOverride || '';
    const isRequired = field.required;

    const fieldForRender = {
      ...field,
      label: displayLabel,
      placeholder: displayPlaceholder,
      required: isRequired,
      options: resolvedOptions,
      readonly: field.readonly || !!field.autoUserId
    };

    if (field.type === 'formula') {
      const fc = field.formula_config || {};
      const isPost = fc.compute_mode === 'post';
      const rawVal = formData[field.key];
      const { num: parsedNum, unit: parsedUnit } = parseLeadingNumber(rawVal);
      const isNumeric = rawVal !== '' && rawVal !== null && rawVal !== undefined && !isNaN(parsedNum) && fc.outputType !== 'text';
      const displayVal = isNumeric
        ? formatNumber(parsedNum, { format: fc.numberFormat || fc.outputFormat || 'plain', decimalPlaces: fc.decimalPlaces, unit: fc.unit || parsedUnit })
        : (rawVal || '');
      return (
        <input
          type="text"
          className="form-control"
          value={displayVal}
          readOnly
          disabled
          placeholder={isPost ? 'Tính sau khi lưu' : 'Tính tự động'}
        />
      );
    }

    return (
      <DynamicField
        field={fieldForRender}
        value={formData[field.key]}
        onChange={(val) => handleChange(field.key, val)}
        error={errors[field.key]}
        disabled={fieldForRender.readonly}
        entityType={entity}
        uploadUrl={guestMode ? '/files/guest-upload' : '/files/upload'}
        allowedOptions={optionAllowlist[field.key] || null}
        allFields={allEntityFields.length > 0 ? allEntityFields : fields}
        dataListOptions={dataListOptions}
      />
    );
  };

  const layoutConfig = formConfig?.layout_config
    ? (typeof formConfig.layout_config === 'string' ? JSON.parse(formConfig.layout_config) : formConfig.layout_config)
    : null;
  const hasSections = layoutConfig && layoutConfig.sections && layoutConfig.sections.length > 0;
  const hasLayout = hasSections || (layoutConfig && layoutConfig.rows && layoutConfig.rows.length > 0);

  const fieldsByKey = {};
  fields.forEach(f => { fieldsByKey[f.key] = f; });
  const fieldsById = {};
  fields.forEach(f => { fieldsById[f.id || f.fieldId] = f; });

  const fieldInCell = {};
  fields.forEach(f => {
    if (f.config?.rowId) {
      fieldInCell[`${f.config.rowId}-${f.config.colIndex}`] = f;
    }
  });

  const getCellField = (rowId, colIndex) => {
    return fieldInCell[`${rowId}-${colIndex}`] || null;
  };

  const renderLayoutForm = () => {
    const rowsToRender = hasSections ? null : layoutConfig.rows;
    const sectionMap = buildSectionMap(layoutConfig);

    const renderRow = (row) => {
      const desktopCol = parseInt(row.columns.split(':')[1]);
      const cells = Array.from({ length: desktopCol }).map((_, colIdx) => getCellField(row.id, colIdx));
      if (!cells.some((f) => f && isFieldVisible(f))) return null;
      return (
        <div key={row.id} className={`form-row form-row-${row.columns}`} data-cols={row.columns}>
          {Array.from({ length: desktopCol }).map((_, colIdx) => {
            const cellField = getCellField(row.id, colIdx);
            if (!cellField || !isFieldVisible(cellField)) {
              return <div key={colIdx} className="form-cell-empty" />;
            }
            return (
              <div key={colIdx} className="form-cell-content">
                <div className="dynamic-form-field" data-field-key={cellField.key}>
                  <label>
                    {cellField.labelOverride || cellField.label}
                    {cellField.required && <span className="text-red-600"> *</span>}
                  </label>
                  {renderField(cellField)}
                  {cellField.help_text && <div className="field-help">{cellField.help_text}</div>}
                  {errors[cellField.key] && <div className="field-error">{errors[cellField.key]}</div>}
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    const renderSectionContent = (section) => (section.rows || []).map((row) => renderRow(row));

    const renderSectionBlock = (section) => (
      <fieldset key={section.id} className="form-section" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
        {section.title && (
          <legend style={{ fontWeight: 600, fontSize: 14, padding: '0 8px', color: '#374151' }}>
            {section.title}
          </legend>
        )}
        {section.collapsible ? (
          <details open>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280', marginBottom: 8 }}> Chi tiết</summary>
            {renderSectionContent(section)}
          </details>
        ) : (
          renderSectionContent(section)
        )}
      </fieldset>
    );

    const renderTabGroup = (node, path, depth) => {
      if (!node || depth > MAX_TAB_DEPTH) return null;
      if (!evalVisibleWhen(node, formData)) return null;
      const tabs = (node.tabs || []).filter(Boolean);
      if (tabs.length === 0) return null;
      const activeId = activeTabs[path] || tabs[0].id;
      return (
        <fieldset key={node.id || path} className="form-section form-tabs" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          {node.title && (
            <legend style={{ fontWeight: 600, fontSize: 14, padding: '0 8px', color: '#374151' }}>
              {node.title}
            </legend>
          )}
          <div className="form-tabs-bar" role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 12, overflowX: 'auto' }}>
            {tabs.map((tab) => {
              const isActive = tab.id === activeId;
              return (
                <button
                  type="button"
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTabs((prev) => ({ ...prev, [path]: tab.id }))}
                  style={{
                    padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: 'none', borderBottom: isActive ? '2px solid #4f46e5' : '2px solid transparent',
                    background: 'transparent', color: isActive ? '#4f46e5' : '#6b7280', whiteSpace: 'nowrap'
                  }}
                >
                  {tab.title}
                </button>
              );
            })}
          </div>
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <div key={tab.id} role="tabpanel" style={{ display: isActive ? 'block' : 'none' }}>
                {(tab.sectionRefs || []).map((refId) => {
                  const sec = sectionMap[refId];
                  if (!sec) return null;
                  if (sec.type === 'tabs' || Array.isArray(sec.tabs)) {
                    return renderTabGroup(sec, `${path}/${tab.id}`, depth + 1);
                  }
                  return <div key={refId} className="form-tab-section">{renderSectionContent(sec)}</div>;
                })}
                {Array.isArray(tab.tabs) && renderTabGroup(tab, `${path}/${tab.id}`, depth + 1)}
              </div>
            );
          })}
        </fieldset>
      );
    };

    return (
      <>
        {hasSections ? (
          layoutConfig.sections.map((section) => {
            if (section.type === 'tabs' || Array.isArray(section.tabs)) {
              return renderTabGroup(section, section.id, 1);
            }
            if (!evalVisibleWhen(section, formData)) return null;
            return renderSectionBlock(section);
          })
        ) : (
          rowsToRender.map(row => renderRow(row))
        )}

        {fields.filter(f => !f.config?.rowId && isFieldVisible(f)).length > 0 && (
          <div className="dynamic-form-row">
            {fields.filter(f => !f.config?.rowId && isFieldVisible(f)).map(field => {
              const colSpan = field.config?.colSpan || 1;
              return (
                <div key={field.id || field.key} data-field-key={field.key} className={`dynamic-form-field ${colSpan > 1 ? 'full-width' : ''}`} style={colSpan > 1 ? { gridColumn: `span ${colSpan}` } : undefined}>
                  <label>
                    {field.labelOverride || field.label}
                    {field.required && <span className="text-red-600"> *</span>}
                  </label>
                  {renderField(field)}
                  {field.help_text && <div className="field-help">{field.help_text}</div>}
                  {errors[field.key] && <div className="field-error">{errors[field.key]}</div>}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const renderFlatForm = () => {
    return (
      <div className="dynamic-form-row">
        {fields.filter(f => isFieldVisible(f)).map(field => {
          const colSpan = field.config?.colSpan || 1;
          return (
            <div key={field.id || field.key} className={`dynamic-form-field ${colSpan > 1 ? 'full-width' : ''}`} style={colSpan > 1 ? { gridColumn: `span ${colSpan}` } : undefined}>
              <label>
                {field.labelOverride || field.label}
                {field.required && <span className="text-red-600"> *</span>}
              </label>
              {renderField(field)}
              {field.help_text && <div className="field-help">{field.help_text}</div>}
              {errors[field.key] && <div className="field-error">{errors[field.key]}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderNoLayoutMessage = () => {
    return (
      <div className="form-no-layout">
        <div className="form-no-layout-icon">⚙️</div>
        <h3>Chưa cấu hình layout</h3>
        <p>Vui lòng vào <strong>Admin → Forms</strong> để cấu hình layout cho form này.</p>
        <p>Sau khi cấu hình layout, form sẽ hiển thị các trường nhập liệu.</p>
      </div>
    );
  };

  return (
    <form ref={formRef} className="dynamic-form" onSubmit={handleSubmit}>
      {error && <div className="error-message" data-error-banner>{error}</div>}
      {submitAttempted && getOrderedErrorKeys(errors).length > 0 && (
        <div className="form-error-summary" data-error-summary>
          <div className="form-error-summary-title">Vui lòng kiểm tra {getOrderedErrorKeys(errors).length} lỗi sau:</div>
          <ul>
            {getOrderedErrorKeys(errors).map(k => (
              <li key={k}>
                <button type="button" onClick={() => focusFirstError([k])}>{errors[k]}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {geocoding && <div className="text-xs text-info mb-2">Đang tìm địa chỉ từ tọa độ...</div>}
      {hasLayout ? renderLayoutForm() : renderNoLayoutMessage()}
      {hasLayout && (
        children ? (
          <div className="form-actions">
            {children}
            <button type="submit" className="btn btn-primary">Lưu</button>
          </div>
        ) : (
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Lưu</button>
          </div>
        )
      )}
    </form>
  );
};

export default DynamicForm;
