import { useState, useEffect, useRef } from 'react';
import { dynamicService, formService, stationService, adminUserService, adminProposalService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import FieldRenderer from '../dynamic/FieldRenderer';
import DynamicField from '../dynamic/DynamicField';
import UserExternalPanel from './UserExternalPanel';
import LocationMapModal from '../LocationMapModal';
import ProposalActivityPopup from './ProposalActivityPopup';
import StationActivityPopup from './StationActivityPopup';
import { MapPinned, History, AlertTriangle, CheckCircle2, Eye, Hash } from 'lucide-react';
import { notifyBellRefresh } from '../layout/NotificationBell';
import ConfirmDialog from '../ConfirmDialog';
import ExtendDeadlineDialog from './ExtendDeadlineDialog';
import { loadCountdownConfig, getSupplementStatuses, COUNTDOWN_CONFIG_EVENT, FALLBACK_SUPPLEMENT_STATUSES } from '../../utils/countdownConfig';
import useDataListMap from '../../hooks/useDataListMap';
import useFieldOptions from '../../hooks/useFieldOptions';
import DeadlineCountdown from '../DeadlineCountdown';
import { collectTableDatalistIds } from '../../utils/tableColumnSource';
import Toast from '../Toast';
import { computeFormulaValue } from '../../utils/formulaEngine';

const PUSH_USER_KEYS = ['nguoi_phu_trach', 'nguoi_giao_phu_trach'];

const resolveUserId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const raw = (typeof value === 'object' && value !== null) ? (value.id ?? value.user_id ?? value.value) : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const ENTITY_LABELS = {
  stations: 'Trạm',
  users: 'User',
  station_proposals: 'Đề xuất'
};

const ENTITY_SERVICES = {
  stations: stationService,
  users: adminUserService,
  station_proposals: adminProposalService
};

const DEFAULT_VIEW_IDS = { stations: 6, users: 7, station_proposals: 8 };

const RecordDetailPopup = ({ entity, recordId, viewId, mode: modeProp, record: recordProp, onClose, onSaved, onSwitchMode, allowEdit = true, updateService = null, beforeActions = null }) => {
  const { token, user: authUser } = useAuth();
  const navigate = useNavigate();
  const { getFieldLabel } = useFieldOptions('station_proposals', PUSH_USER_KEYS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [viewFields, setViewFields] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [record, setRecord] = useState(recordProp || null);
  const [mode, setMode] = useState(modeProp || 'view');
  const [formData, setFormData] = useState({});
  const [formConfig, setFormConfig] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showStationLog, setShowStationLog] = useState(false);
  const [linkedProposal, setLinkedProposal] = useState(null);
  const [linkNote, setLinkNote] = useState('');
  const [activeTabs, setActiveTabs] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [confirmStatuses, setConfirmStatuses] = useState(FALLBACK_SUPPLEMENT_STATUSES);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null });
  const [confirming, setConfirming] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendLimits, setExtendLimits] = useState(null);

  const openExtend = async () => {
    setExtendOpen(true);
    setExtendLimits(null);
    try {
      if (record && record.id && infoSvc.extendInfo) {
        const res = await infoSvc.extendInfo(record.id, token);
        if (res && res.success && res.data) {
          setExtendLimits({ maxDaysPerTime: res.data.maxDaysPerTime, remaining: res.data.remaining, maxTimes: res.data.maxTimes });
        }
      }
    } catch { /* dialog dùng giới hạn mặc định */ }
  };
  const modalRef = useRef(null);
  const dataListIds = (() => {
    const ids = new Set([...viewFields, ...allFields].map(f => f.data_list_id).filter(Boolean));
    [...viewFields, ...allFields].forEach(f => {
      if (f.type !== 'table') return;
      const tc = (() => {
        if (!f.source_config) return {};
        if (typeof f.source_config === 'object') return f.source_config;
        try { return JSON.parse(f.source_config); } catch { return {}; }
      })();
      (tc.columns || []).forEach(col => { for (const id of collectTableDatalistIds([col], allFields)) ids.add(id); });
    });
    return [...ids];
  })();
  const dataListOptions = useDataListMap(dataListIds);

  useEffect(() => {
    if (!error || !modalRef.current) return;
    const body = modalRef.current.querySelector('.popup-body');
    (body || modalRef.current).scrollTo({ top: 0, behavior: 'smooth' });
  }, [error]);

  useEffect(() => {
    if (modeProp) setMode(allowEdit ? modeProp : 'view');
  }, [modeProp, allowEdit]);

  useEffect(() => {
    let cancelled = false;
    loadCountdownConfig().then((cfg) => { if (!cancelled && cfg) setConfirmStatuses(getSupplementStatuses(cfg)); });
    const refresh = () => {
      loadCountdownConfig(true).then((cfg) => { if (!cancelled && cfg) setConfirmStatuses(getSupplementStatuses(cfg)); });
    };
    window.addEventListener(COUNTDOWN_CONFIG_EVENT, refresh);
    return () => { cancelled = true; window.removeEventListener(COUNTDOWN_CONFIG_EVENT, refresh); };
  }, []);

  useEffect(() => {
    if (!recordProp && recordId && entity) {
      loadRecord();
    } else if (recordProp) {
      setRecord(recordProp);
      setLoading(true);
      loadViewConfig(recordProp).finally(() => setLoading(false));
    }
  }, [entity, recordId, recordProp]);

  useEffect(() => {
    let cancelled = false;
    setLinkedProposal(null);
    setLinkNote('');
    if (entity === 'stations' && record && record.id) {
      stationService.sourceProposal(record.id, token)
        .then(res => {
          if (cancelled) return;
          if (res && res.success && res.data) setLinkedProposal(res.data);
        })
        .catch(() => { /* 404 = khong co de xuat nguon */ });
    }
    return () => { cancelled = true; };
  }, [entity, record && record.id]);

  const openLinkedStation = async () => {
    const sid = record && record.station_id;
    if (!sid) return;
    try {
      const res = await stationService.getById(sid);
      if (res && res.success && res.data) {
        navigate(`/admin/stations/view=${sid}`);
        return;
      }
    } catch { /* fallthrough */ }
    setLinkNote('Trạm đã bị xóa — ghi đè lại trạng thái Ký thành công để tạo trạm mới.');
    setToast({ message: 'Trạm liên kết đã bị xóa', type: 'warning' });
  };

  useEffect(() => {
    if (mode !== 'edit' || allFields.length === 0) return;
    setFormData(prev => {
      let changed = false;
      const next = { ...prev };
      allFields.forEach(f => {
        if (f.type !== 'formula') return;
        const val = computeFormulaValue(f, allFields, next);
        if (val !== '' && next[f.key] !== val) {
          next[f.key] = val;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [mode, allFields, formData]);

  const loadRecord = async () => {
    try {
      setLoading(true);
      setError('');
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      let url;
      if (entity === 'stations') url = `${baseUrl}/stations/${recordId}`;
      else if (entity === 'users') url = `${baseUrl}/admin/users/${recordId}`;
      else url = `${baseUrl}/admin/proposals/${recordId}`;

      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setRecord(data.data);
        await loadViewConfig(data.data);
      } else {
        setError('Không tìm thấy bản ghi');
      }
    } catch (e) {
      setError('Lỗi tải bản ghi');
    } finally {
      setLoading(false);
    }
  };

  const loadViewConfig = async (recordData) => {
    const vId = viewId || DEFAULT_VIEW_IDS[entity];
    if (!vId) return;
    try {
      const res = await dynamicService.getViewConfig(entity, vId);
      if (res.success) {
        const vf = res.data.fields || [];
        const af = res.data.allFields || [];
        setViewFields(vf);
        setAllFields(af);
        initFormData(af, recordData || record);
      }
      try {
        const formRes = await formService.getByEntityAndPurpose(entity, 'view');
        if (formRes.success && formRes.data) {
          const lc = formRes.data.layout_config
            ? (typeof formRes.data.layout_config === 'string' ? JSON.parse(formRes.data.layout_config) : formRes.data.layout_config)
            : null;
          const fullFormRes = await formService.getById(formRes.data.id);
          setFormConfig({
            ...formRes.data,
            layout_config: lc,
            fields: fullFormRes.success ? fullFormRes.data.fields : []
          });
        }
      } catch {
        // no view form configured
      }
    } catch {
      // silent
    }
  };

  const initFormData = (fields, recordOverride) => {
    const rec = recordOverride || record;
    const data = {};
    (fields || []).forEach(f => {
      const key = f.key;
      let val = rec ? getFieldValue(rec, { key }) : '';
      if (val === undefined || val === null) {
        if (f.type === 'table' || f.type === 'multiselect') val = [];
        else if (f.type === 'boolean') val = false;
        else val = '';
      }
      data[key] = val;
    });
    setFormData(data);
  };

  const getFieldValue = (row, field) => {
    if (row[field.key] !== undefined && row[field.key] !== null) return row[field.key];
    if (row.custom_data) {
      try {
        const cd = typeof row.custom_data === 'string' ? JSON.parse(row.custom_data) : row.custom_data;
        return cd[field.key];
      } catch { return null; }
    }
    return null;
  };

  const missingPushUserLabels = (rec) => {
    if (!rec || entity !== 'station_proposals') return [];
    const status = rec.status;
    if (status !== 'PENDING' && status !== 'REVIEWING') return [];
    const custom = (rec && rec.custom_data) || {};
    const labels = [];
    for (const key of PUSH_USER_KEYS) {
      const direct = rec ? rec[key] : null;
      const v = (direct !== undefined && direct !== null && direct !== '') ? direct : custom[key];
      const idVal = resolveUserId(v);
      if (!idVal) labels.push(getFieldLabel(key));
    }
    return labels;
  };

  const pushUserWarnings = () => {
    return [];
  };

  const infoSvc = (updateService && updateService.confirmInfo) ? updateService : adminProposalService;
  const showInfoConfirm = entity === 'station_proposals'
    && record && record.id
    && record.supplement_deadline_at
    && confirmStatuses.includes(record.status)
    && allowEdit;
  const infoCompleted = !!(record && record.info_completed_at);

  const handleInfoAction = async () => {
    const action = confirmDialog.action;
    if (!action || !record || !record.id) return;
    setConfirming(true);
    try {
      const res = action === 'confirm'
        ? await infoSvc.confirmInfo(record.id, token)
        : await infoSvc.reopenInfo(record.id, token);
      if (res && res.success) {
        if (res.data) setRecord(res.data);
        setToast({ message: res.message || 'Thành công', type: 'success' });
        notifyBellRefresh();
        if (onSaved) onSaved();
      } else {
        setToast({ message: (res && res.message) || 'Thao tác thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setConfirming(false);
      setConfirmDialog({ open: false, action: null });
    }
  };

  const handleExtend = async ({ days, hours, reason }) => {
    if (!record || !record.id || !infoSvc.extendDeadline) return;
    setExtending(true);
    try {
      const res = await infoSvc.extendDeadline(record.id, { days, hours, reason }, token);
      if (res && res.success) {
        if (res.data) setRecord(res.data);
        setToast({ message: res.message || 'Gia hạn thành công', type: 'success' });
        notifyBellRefresh();
        if (onSaved) onSaved();
        setExtendOpen(false);
      } else {
        setToast({ message: (res && res.message) || 'Gia hạn thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setExtending(false);
    }
  };

  const handleFieldChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setFormErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const getParentValue = (parentCol) => {
    if (formData[parentCol] !== undefined) return formData[parentCol];
    const all = [...viewFields, ...allFields];
    const parentDef = all.find(f => f.data_list_column === parentCol);
    if (parentDef) return formData[parentDef.field_key || parentDef.key];
    return undefined;
  };

  const resolveFieldOptions = (field) => {
    const dlId = field.data_list_id;
    if (dlId && dataListOptions[dlId]) {
      const { tree, unique } = dataListOptions[dlId];
      const col = field.data_list_column;
      if (col && unique[col]) {
        if (field.parent_field) {
          const parentVal = getParentValue(field.parent_field);
          if (!parentVal) return [];
          const parentCol = field.parent_field;
          if (parentCol && tree[parentCol] && tree[parentCol][parentVal]) {
            const seen = new Set();
            return tree[parentCol][parentVal]
              .filter(r => {
                const v = r._raw?.[col];
                if (v && !seen.has(v)) { seen.add(v); return true; }
                return false;
              })
              .map(r => ({ value: r._raw[col], label: r._raw[col], _raw: r._raw }));
          }
          return [];
        }
        return unique[col].map(v => ({ value: v, label: v }));
      }
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

  const handleSave = async () => {
    try {
      setError('');
      setSubmitAttempted(true);
      const errs = validate();
      setFormErrors(errs);
      if (getOrderedErrorKeys(errs).length > 0) {
        setTimeout(() => {
          const body = modalRef.current?.querySelector('.popup-body');
          const banner = body?.querySelector('[data-error-summary]');
          if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
          else if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
        }, 80);
        return;
      }
      setSaving(true);
      const service = updateService || ENTITY_SERVICES[entity];
      if (!service) {
        setError('Entity không hỗ trợ cập nhật');
        setSaving(false);
        return;
      }
      const fixedKeys = ['id', 'created_at', 'updated_at', 'password'];
      const jsonFields = allFields.filter(f => f.source_type === 'json');
      const customData = {};
      jsonFields.forEach(f => {
        if (formData[f.key] !== undefined) {
          customData[f.key] = formData[f.key];
        }
      });
      const payload = { ...formData, custom_data: Object.keys(customData).length > 0 ? customData : undefined };
      fixedKeys.forEach(k => { delete payload[k]; });
      const res = await service.update(record.id, payload, token);
      if (res.success) {
        let saved = res.data;
        let msg = entity === 'station_proposals' && record?.status === 'REJECTED' ? 'Đã gửi lại đề xuất' : 'Cập nhật thành công';
        if (entity === 'station_proposals' && record?.status === 'REJECTED' && !updateService) {
          try {
            const st = await adminProposalService.updateStatus(record.id, 'PENDING', token);
            if (st.success && st.data) saved = st.data;
            else msg = 'Đã lưu nội dung nhưng gửi lại thất bại — hãy thử lại';
          } catch {
            msg = 'Đã lưu nội dung nhưng gửi lại thất bại — hãy thử lại';
          }
        }
        setToast({ message: msg, type: 'success' });
        setRecord({ ...record, ...formData, ...saved });
        setMode('view');
        notifyBellRefresh();
        if (onSaved) onSaved();
      } else {
        setError(res.message || 'Lỗi cập nhật');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  const handleSwitchMode = (newMode) => {
    setMode(newMode);
    setFormErrors({});
    setSubmitAttempted(false);
    if (newMode === 'edit') initFormData([...viewFields, ...otherFields], record);
    if (onSwitchMode) onSwitchMode(newMode);
  };

  const viewFieldKeys = viewFields.map(f => f.field_key || f.key);
  const mainFields = viewFields.filter(f => f.visible);
  const otherFields = allFields.filter(f => !viewFieldKeys.includes(f.key));

  const evalFieldConditions = (config, data) => {
    const conditions = config?.conditions;
    if (!conditions || conditions.length === 0) return true;
    const src = data || {};
    const results = conditions.map(cond => {
      if (!cond.field) return true;
      const val = getFieldValue(src, { key: cond.field });
      const checkVal = cond.value || '';
      switch (cond.operator) {
        case '=': return String(val ?? '') === checkVal;
        case '!=': return String(val ?? '') !== checkVal;
        case 'contains': return String(val ?? '').toLowerCase().includes(checkVal.toLowerCase());
        case '>': return Number(val) > Number(checkVal);
        case '<': return Number(val) < Number(checkVal);
        case 'empty': return val === '' || val === null || val === undefined;
        case 'not_empty': return val !== '' && val !== null && val !== undefined;
        default: return true;
      }
    });
    return config.conditionLogic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  };

  const isFieldVisible = (field) => {
    if (!field.conditions || field.conditions.length === 0) return true;
    const results = field.conditions.map(cond => {
      if (!cond.field || cond.field === '') return true;
      const val = formData[cond.field];
      const checkVal = cond.value || '';
      switch (cond.operator) {
        case '=': return String(val ?? '') === checkVal;
        case '!=': return String(val ?? '') !== checkVal;
        case 'contains': return String(val ?? '').toLowerCase().includes(checkVal.toLowerCase());
        case '>': return Number(val) > Number(checkVal);
        case '<': return Number(val) < Number(checkVal);
        case 'empty': return val === '' || val === null || val === undefined;
        case 'not_empty': return val !== '' && val !== null && val !== undefined;
        default: return true;
      }
    });
    return field.conditionLogic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  };

  const validate = () => {
    const newErrors = {};
    const layout = getLayoutSections();
    const visibleFieldKeys = new Set();
    if (layout) {
      layout.sections.forEach(sec => {
        (sec.rows || []).forEach(row => {
          const cols = parseInt((row.columns || '1:1').split(':')[1]);
          for (let ci = 0; ci < cols; ci++) {
            const field = layout.cellMap[`${row.id}-${ci}`];
            if (field) visibleFieldKeys.add(field.field_key || field.key);
          }
        });
      });
    }
    const fieldsToCheck = visibleFieldKeys.size > 0
      ? allFields.filter(f => visibleFieldKeys.has(f.key))
      : allFields;
    fieldsToCheck.forEach(f => {
      if (!f.required) return;
      if (f.type === 'formula') return;
      const val = formData[f.key];
      const label = f.field_label || f.label || f.key;
      if (f.type === 'multiselect' && Array.isArray(val) && val.length === 0) {
        newErrors[f.key] = `${label} là bắt buộc`;
      } else if (f.type === 'table' && Array.isArray(val) && val.length === 0) {
        newErrors[f.key] = `${label} phải có ít nhất 1 dòng`;
      } else if (val === '' || val === null || val === undefined) {
        newErrors[f.key] = `${label} là bắt buộc`;
      }
      if (f.type === 'table' && Array.isArray(val) && val.length > 0) {
        const tc = (() => {
          if (!f.source_config) return {};
          if (typeof f.source_config === 'object') return f.source_config;
          try { return JSON.parse(f.source_config); } catch { return {}; }
        })();
        const reqCols = (tc.columns || []).filter(c => c && c.required);
        if (reqCols.length > 0 && !newErrors[f.key]) {
          for (let i = 0; i < val.length; i++) {
            const row = val[i] || {};
            const missing = reqCols.filter(c => row[c.key] === '' || row[c.key] === null || row[c.key] === undefined);
            if (missing.length > 0) {
              newErrors[f.key] = `${label}: dòng ${i + 1} thiếu ${missing.map(c => c.label || c.key).join(', ')}`;
              break;
            }
          }
        }
      }
    });
    return newErrors;
  };

  const getOrderedErrorKeys = (errObj) => {
    const order = {};
    allFields.forEach((f, i) => { order[f.key] = i; });
    return Object.keys(errObj || {}).sort((a, b) => (order[a] ?? 9999) - (order[b] ?? 9999));
  };

  const getLayoutSections = () => {
    if (!formConfig?.layout_config?.sections) return null;
    const lc = formConfig.layout_config;
    const data = mode === 'edit' ? formData : (record || formData);
    const fieldsForm = formConfig.fields || [];
    const fieldsAll = [...viewFields, ...otherFields];
    const fieldsByKey = {};
    fieldsAll.forEach(f => { fieldsByKey[f.field_key || f.key] = f; });
    const cellMap = {};
    fieldsForm.forEach(f => {
      const cfg = f.config ? (typeof f.config === 'string' ? (() => { try { return JSON.parse(f.config); } catch { return null; } })() : f.config) : null;
      if (cfg && cfg.rowId != null && cfg.colIndex != null) {
        const condOk = evalFieldConditions(cfg, data);
        cellMap[`${cfg.rowId}-${cfg.colIndex}`] = condOk ? (fieldsByKey[f.key || f.field_key] || null) : null;
      }
    });
    const rawSections = lc.sections || [];
    const sectionMap = {};
    rawSections.forEach(s => { if (s && s.id) sectionMap[s.id] = s; });
    const visibleSection = (sec) => {
      if (!sec) return false;
      if (sec.visibleWhen) {
        const val = getFieldValue(data, { key: sec.visibleWhen.field });
        if (val !== sec.visibleWhen.value) return false;
      }
      return true;
    };
    const sections = rawSections.filter(sec => visibleSection(sec));
    return { sections, sectionMap, cellMap };
  };

  const layout = getLayoutSections();
  const sections = layout ? layout.sections : null;

  if (loading) return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="legacy-modal legacy-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="loading">Đang tải...</div>
      </div>
    </div>
  );

  if (!record) return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="legacy-modal legacy-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="empty-state">{error || 'Không tìm thấy bản ghi'}</div>
        <div className="popup-footer">
          <button className="btn btn-secondary" onClick={handleClose}>Đóng</button>
        </div>
      </div>
    </div>
  );

  const mapLat = parseFloat(record.latitude);
  const mapLng = parseFloat(record.longitude);
  const hasCoords = !Number.isNaN(mapLat) && !Number.isNaN(mapLng);

  const renderFieldInput = (field) => {
    const key = field.field_key || field.key;
    let value = mode === 'edit' ? formData[key] : getFieldValue(record, { key });
    if (field.type === 'formula' && (value === null || value === undefined || value === '')) {
      const def = allFields.find(f => f.key === key) || field;
      const computed = computeFormulaValue(def, allFields, formData);
      if (computed !== '') value = computed;
    }
    let userLocked = false;
    if (mode === 'edit' && field.type === 'user') {
      let autoMode = null;
      const sc = field.source_config;
      if (sc && typeof sc === 'object') autoMode = sc.auto_user;
      else if (typeof sc === 'string') { try { autoMode = JSON.parse(sc).auto_user; } catch { autoMode = null; } }
      if (['current_user', 'parent_sales', 'owner_or_manager', 'area_director', 'center_director'].includes(autoMode)) {
        userLocked = ['CTV', 'NPP'].includes(authUser && authUser.role);
      }
    }
    return mode === 'edit' ? (
      <DynamicField
        field={{ ...field, options: resolveFieldOptions(field) }}
        value={value}
        onChange={(val) => handleFieldChange(key, val)}
        error={formErrors[key]}
        entityId={record.id}
        entityType={entity}
        allFields={allFields}
        dataListOptions={dataListOptions}
        disabled={userLocked}
        formValues={formData}
      />
    ) : (
      <FieldRenderer field={field} value={value} entity={entity} entityId={record.id} dataListOptions={dataListOptions} expandTable />
    );
  };

  const renderFieldSection = (fields, sectionLabel) => (
    <div className="popup-section">
      <h3 className="popup-section-title">{sectionLabel}</h3>
      <div className="popup-fields">
        {fields.map(field => {
          const key = field.field_key || field.key;
          const label = field.field_label || field.label;
          const fieldError = mode === 'edit' ? formErrors[key] : null;
          return (
            <div key={key} data-field-key={key} className={`popup-field-row${fieldError ? ' has-error' : ''}`}>
              <span className="popup-field-label">{label}{field.required && field.type !== 'formula' && <span style={{ color: '#dc2626' }}> *</span>}</span>
              {mode === 'view' ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', background: '#f8fafc', minHeight: 38 }}>{renderFieldInput(field)}</div>
              ) : (
                <span className="popup-field-value">{renderFieldInput(field)}{fieldError && <div className="field-error">{fieldError}</div>}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSectionRows = (sec) => (sec.rows || []).map(row => {
    const cols = parseInt((row.columns || '1:1').split(':')[1]);
    return (
      <div key={row.id} className="form-row" data-cols={row.columns} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        {Array.from({ length: cols }).map((_, ci) => {
          const field = layout ? (layout.cellMap[`${row.id}-${ci}`] || null) : null;
          if (!field) return <div key={ci} className="form-cell-empty" />;
          const label = field.field_label || field.label;
          const key = field.field_key || field.key;
          const fieldError = mode === 'edit' ? formErrors[key] : null;
          const isFullRow = field.type === 'table';
          return (
            <div key={ci} className={`form-cell-content${isFullRow ? ' form-cell-full' : ''}`} style={{ flex: isFullRow ? '1 1 100%' : 1, maxWidth: isFullRow ? '100%' : undefined }}>
              <div className={`dynamic-form-field${fieldError ? ' has-error' : ''}`} data-field-key={key}>
                <label style={{ fontWeight: 500, fontSize: 13, color: '#374151', marginBottom: 4, display: 'block' }}>{label}{field.required && field.type !== 'formula' && <span style={{ color: '#dc2626' }}> *</span>}</label>
                {mode === 'view' ? (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', background: '#f8fafc', minHeight: 38 }}>{renderFieldInput(field)}</div>
                ) : (
                  <>{renderFieldInput(field)}{fieldError && <div className="field-error">{fieldError}</div>}</>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  });

  const renderTabGroup = (node, path, depth) => {
    if (!node || depth > 5) return null;
    const tabs = (node.tabs || []).filter(Boolean);
    if (tabs.length === 0) return null;
    const activeId = activeTabs[path] || tabs[0].id;
    return (
      <fieldset key={node.id || path} className="form-section" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
        {node.title && <legend className="form-section-title">{node.title}</legend>}
        <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 12, overflowX: 'auto' }}>
          {tabs.map(tab => {
            const isActive = tab.id === activeId;
            return (
              <button
                type="button"
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTabs(prev => ({ ...prev, [path]: tab.id }))}
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
        {tabs.map(tab => {
          const isActive = tab.id === activeId;
          return (
            <div key={tab.id} role="tabpanel" style={{ display: isActive ? 'block' : 'none' }}>
              {(tab.sectionRefs || []).map(refId => {
                const sec = layout && layout.sectionMap[refId];
                if (!sec) return null;
                if (sec.type === 'tabs' || Array.isArray(sec.tabs)) {
                  return renderTabGroup(sec, `${path}/${tab.id}`, depth + 1);
                }
                return <div key={refId}>{renderSectionRows(sec)}</div>;
              })}
              {Array.isArray(tab.tabs) && renderTabGroup(tab, `${path}/${tab.id}`, depth + 1)}
            </div>
          );
        })}
      </fieldset>
    );
  };

  const renderSectionNode = (sec) => {
    if (sec.type === 'tabs' || Array.isArray(sec.tabs)) {
      return renderTabGroup(sec, sec.id, 1);
    }
    return (
      <fieldset key={sec.id} className="form-section" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
        {sec.title && <legend className="form-section-title">{sec.title}</legend>}
        {renderSectionRows(sec)}
      </fieldset>
    );
  };

  return (
    <div className="modal-overlay" onClick={mode === 'edit' ? undefined : handleClose}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <div ref={modalRef} className="legacy-modal legacy-modal-lg popup-detail" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <h2>{ENTITY_LABELS[entity] || entity} #{record.id} {mode === 'edit' && '(chỉnh sửa)'}</h2>
          <div className="flex items-center gap-2">
            {hasCoords && (
              <button className="btn btn-sm btn-outline btn-primary gap-1" onClick={() => setShowMap(true)}>
                <MapPinned size={14} />
                Xem bản đồ
              </button>
            )}
            {entity === 'station_proposals' && record?.id && (
              <button className="btn btn-sm btn-outline gap-1" onClick={() => setShowLog(true)} title="Xem lịch sử hoạt động của đề xuất">
                <History size={14} />
                Xem log
              </button>
            )}
            {entity === 'station_proposals' && record?.station_id && (
              <button className="btn btn-sm btn-outline btn-info gap-1" onClick={openLinkedStation} title={`Xem trạm #${record.station_id} được tạo từ đề xuất này`}>
                <Eye size={14} />
                Xem trạm #{record.station_id}
              </button>
            )}
            {entity === 'stations' && record?.id && (
              <button className="btn btn-sm btn-outline gap-1" onClick={() => setShowStationLog(true)} title="Xem lịch sử hoạt động của trạm">
                <History size={14} />
                Xem log
              </button>
            )}
            {entity === 'stations' && linkedProposal && linkedProposal.id && (
              <button className="btn btn-sm btn-outline btn-info gap-1" onClick={() => navigate(`/admin/proposals/view=${linkedProposal.id}`)} title="Xem đề xuất đã tạo ra trạm này">
                <Eye size={14} />
                Xem đề xuất #{linkedProposal.id}
              </button>
            )}
            <button className="btn-close" onClick={handleClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        <div className="popup-body">
          {error && <div className="error-message">{error}</div>}

          <DeadlineCountdown deadline={record.supplement_deadline_at} transitionDeadline={record.transition_deadline_at} status={record.status} completedAt={record.info_completed_at} />

          {entity === 'station_proposals' && record?.pending_station_code && (
          <div className="alert py-2 px-3 text-sm alert-info" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Hash size={16} />
            <span>Mã trạm chờ: <b className="font-mono">{record.pending_station_code}</b> (tự động giữ khi duyệt chủ trương)</span>
          </div>
          )}

        {showInfoConfirm && (
          <div className={`alert py-2 px-3 text-sm ${infoCompleted ? 'alert-success' : 'alert-info'}`} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {infoCompleted ? (
              <>
                <CheckCircle2 size={16} />
                <span>
                  Đã xác nhận đủ thông tin
                  {record.info_completed_at ? ` lúc ${new Date(record.info_completed_at).toLocaleString('vi-VN')}` : ''}.
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setConfirmDialog({ open: true, action: 'reopen' })}
                  >
                    Mở lại để bổ sung
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={openExtend}
                  >
                    Gia hạn
                  </button>
                </span>
              </>
            ) : (
              <>
                <AlertTriangle size={16} />
                <span>Kiểm tra kỹ rồi xác nhận để admin xét duyệt.</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setConfirmDialog({ open: true, action: 'confirm' })}
                  >
                    Xác nhận đã đủ thông tin
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={openExtend}
                  >
                    Gia hạn
                  </button>
                </span>
              </>
            )}
          </div>
          )}

          {entity === 'station_proposals' && record?.status === 'REJECTED' && record?.reject_reason && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              <span className="text-sm"><strong>Đề xuất bị từ chối:</strong> {record.reject_reason}</span>
            </div>
          )}

          {entity === 'station_proposals' && mode === 'view' && missingPushUserLabels(record).length > 0 && (
            <div className="form-error-summary" style={{ marginBottom: 12 }}>
              <div className="form-error-summary-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} />
                <span>Cần cập nhật trước khi duyệt — thiếu {missingPushUserLabels(record).length} trường:</span>
              </div>
              <ul>
                {missingPushUserLabels(record).map((label, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => { if (allowEdit) handleSwitchMode('edit'); }}>{label} — chưa được gán</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submitAttempted && getOrderedErrorKeys(formErrors).length > 0 && (
            <div className="form-error-summary" data-error-summary style={{ marginBottom: 12 }}>
              <div className="form-error-summary-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} />
                <span>Vui lòng sửa {getOrderedErrorKeys(formErrors).length} lỗi trước khi lưu:</span>
              </div>
              <ul>
                {getOrderedErrorKeys(formErrors).map(k => (
                  <li key={k}>
                    <button type="button" onClick={() => {
                      const el = (modalRef.current || document).querySelector(`[data-field-key="${CSS.escape(k)}"]`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}>{formErrors[k]}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sections && sections.length > 0 ? (
            sections.map(sec => renderSectionNode(sec))
          ) : (
            <>
              {mainFields.length > 0 && renderFieldSection(mainFields, 'Thông tin chính')}
              {otherFields.length > 0 && renderFieldSection(otherFields, 'Thông tin khác')}
            </>
          )}
          {entity === 'users' && record?.id && <UserExternalPanel userId={record.id} />}
          {typeof beforeActions === 'function' ? beforeActions({ formData, setFormData, mode, record }) : beforeActions}
        </div>

        <div className="popup-footer">
          {mode === 'view' ? (
            <>
              {allowEdit && <button className="btn btn-primary" onClick={() => handleSwitchMode('edit')}>Sửa</button>}
              <button className="btn btn-secondary" onClick={handleClose}>Đóng</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => handleSwitchMode('view')}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : (entity === 'station_proposals' && record?.status === 'REJECTED' ? 'Gửi lại' : 'Lưu')}
              </button>
              <button className="btn btn-secondary" onClick={handleClose}>Đóng</button>
            </>
          )}
        </div>
      </div>

      {showMap && hasCoords && (
        <LocationMapModal
          open
          lat={record.latitude}
          lng={record.longitude}
          title={`${ENTITY_LABELS[entity] || entity} #${record.id}`}
          onClose={() => setShowMap(false)}
        />
      )}
      {showLog && entity === 'station_proposals' && record?.id && (
        <ProposalActivityPopup proposalId={record.id} onClose={() => setShowLog(false)} />
      )}
      {showStationLog && entity === 'stations' && record?.id && (
        <StationActivityPopup stationId={record.id} onClose={() => setShowStationLog(false)} />
      )}
      <ExtendDeadlineDialog
        isOpen={extendOpen}
        saving={extending}
        limits={extendLimits}
        onConfirm={handleExtend}
        onCancel={() => { if (!extending) setExtendOpen(false); }}
      />
      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.action === 'reopen' ? 'Mở lại để bổ sung?' : 'Xác nhận đủ thông tin?'}
        message={confirmDialog.action === 'reopen'
          ? 'Xác nhận đủ thông tin sẽ được gỡ (đề xuất giữ nguyên trạng thái hiện tại và thời hạn cũ) để bạn bổ sung tiếp. Tiếp tục?'
          : 'Bạn chắc chắn đề xuất này đã đầy đủ thông tin? Admin sẽ nhận được thông báo để xét duyệt.'}
        confirmText={confirming ? 'Đang xử lý...' : (confirmDialog.action === 'reopen' ? 'Mở lại' : 'Xác nhận')}
        cancelText="Hủy"
        type={confirmDialog.action === 'reopen' ? 'warning' : 'info'}
        onConfirm={handleInfoAction}
        onCancel={() => { if (!confirming) setConfirmDialog({ open: false, action: null }); }}
      />
    </div>
  );
};

export default RecordDetailPopup;
