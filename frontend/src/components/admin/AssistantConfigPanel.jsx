import { useCallback, useEffect, useState } from 'react';
import { Save, FlaskConical, KeyRound, RefreshCw, GripVertical } from 'lucide-react';
import { api } from '../../services/api';
import MarkdownText from '../help/MarkdownText';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';
import DragDropList from './DragDropList';

const PROVIDER_LABEL = { gemini: 'Gemini (chính)', openrouter: 'OpenRouter (dự phòng)' };

function ModelPicker({ label, values, listState, freeToggle, placeholder, disabled, onChange, onReload }) {
  const items = Array.isArray(listState.items) ? listState.items : [];
  const shown = freeToggle && freeToggle.active ? items.filter((m) => m.free) : items;
  const options = shown.map((m) => ({
    value: m.id,
    label: m.name || m.id,
    hint: m.free !== undefined ? (m.free ? 'Miễn phí' : 'Trả phí') : null,
  }));
  const useList = !listState.loading && !listState.error && options.length > 0;
  return (
    <div className="block">
      <span className="text-xs text-base-content/60">{label}</span>
      {listState.loading && <p className="text-xs text-base-content/50 mt-1">Đang tải danh sách model...</p>}
      {!useList && !listState.loading && (
        <>
          <textarea
            className="textarea textarea-bordered textarea-sm w-full mt-1 font-mono"
            rows={2}
            placeholder={placeholder}
            value={Array.isArray(values) ? values.join('\n') : ''}
            onChange={(e) => onChange(String(e.target.value).split('\n').map((s) => s.trim()).filter(Boolean))}
            disabled={disabled}
          />
          <span className="flex items-center gap-2 mt-1">
            <span className="text-xs text-error">{listState.error || 'Chưa tải được danh sách'}</span>
            <button type="button" className="btn btn-xs btn-ghost gap-1" onClick={onReload} disabled={disabled}>
              <RefreshCw size={12} /> Tải lại danh sách
            </button>
          </span>
        </>
      )}
      {useList && (
        <>
          {freeToggle && (
            <label className="flex items-center gap-1.5 text-xs mt-1 mb-1 cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-xs" checked={!!freeToggle.active} onChange={(e) => freeToggle.onChange(e.target.checked)} disabled={disabled} />
              Chỉ hiện model miễn phí
            </label>
          )}
          <SearchableMultiSelect options={options} values={Array.isArray(values) ? values : []} onChange={onChange} disabled={disabled} placeholder="Chọn model (thử lần lượt từ trên xuống)" />
          <button type="button" className="btn btn-xs btn-ghost gap-1 mt-1" onClick={onReload} disabled={disabled}>
            <RefreshCw size={12} /> Tải lại
          </button>
        </>
      )}
    </div>
  );
}

function ProviderCard({ provider: p, listState, freeOnly, setFreeOnly, onToggle, onModels, onVisionModels, onReloadList }) {
  const visionValues = Array.isArray(p.visionModels) ? p.visionModels : (Array.isArray(p.vision_models) ? p.vision_models : []);
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{PROVIDER_LABEL[p.provider] || p.provider}</span>
          {p.keyConfigured
            ? <span className="badge badge-xs badge-success gap-1"><KeyRound size={11} /> Đã có key</span>
            : <span className="badge badge-xs badge-error gap-1"><KeyRound size={11} /> Chưa có key</span>}
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary ml-auto"
            title="Bật/tắt provider"
            checked={!!p.enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
        </div>
        <ModelPicker
          label="Models (chọn nhiều, thử lần lượt từ trên xuống)"
          values={p.models}
          listState={listState}
          freeToggle={p.provider === 'openrouter' ? { active: freeOnly, onChange: setFreeOnly } : null}
          placeholder="Để trống = dùng model trong .env"
          onChange={onModels}
          onReload={onReloadList}
        />
        {p.provider === 'openrouter' && (
          <ModelPicker
            label="Models thị giác (dùng khi tin nhắn có ảnh/tệp)"
            values={visionValues}
            listState={listState}
            placeholder="Để trống = dùng OPENROUTER_VISION_MODEL trong .env"
            onChange={onVisionModels}
            onReload={onReloadList}
          />
        )}
        <p className="text-xs text-base-content/50">Ưu tiên: {p.priority} · Model hiệu lực: {(Array.isArray(p.effectiveModels) && p.effectiveModels.length > 0 ? p.effectiveModels : ['(theo .env)']).join(', ')}</p>
      </div>
    </div>
  );
}

export default function AssistantConfigPanel({ token }) {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [testQ, setTestQ] = useState('');
  const [testProvider, setTestProvider] = useState('auto');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [modelLists, setModelLists] = useState({});
  const [freeOnly, setFreeOnly] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.getWithAuth('/admin/assistant/config', token);
      if (!res || !res.success) throw new Error((res && res.message) || 'Không tải được cấu hình');
      setProviders(Array.isArray(res.data.providers) ? res.data.providers : []);
    } catch (err) {
      setError(err.message || 'Không tải được cấu hình');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const loadModels = useCallback(async (name, refresh = false) => {
    if (!token) return;
    setModelLists((prev) => ({ ...prev, [name]: { ...prev[name], loading: true, error: '' } }));
    try {
      const res = await api.getWithAuth(`/admin/assistant/models?provider=${name}${refresh ? '&refresh=1' : ''}`, token);
      if (!res || !res.success) throw new Error((res && res.message) || 'Không tải được danh sách');
      setModelLists((prev) => ({ ...prev, [name]: { loading: false, error: '', items: res.data.models || [], fetchedAt: res.data.fetchedAt } }));
    } catch (err) {
      setModelLists((prev) => ({ ...prev, [name]: { loading: false, error: err.message || 'Không tải được', items: [] } }));
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadModels('gemini');
    loadModels('openrouter');
  }, [token, loadModels]);

  const patchProvider = (name, patch) => {
    setProviders((prev) => prev.map((p) => (p.provider === name ? { ...p, ...patch } : p)));
  };

  const setModels = (name, field, list) => {
    patchProvider(name, { [field]: list });
  };

  const reorderFallback = (newItems) => {
    setProviders((prev) => prev.map((p) => ({
      ...p,
      priority: newItems.findIndex((x) => x.provider === p.provider) + 1 || p.priority,
    })));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body = {
        providers: providers.map((p) => ({
          provider: p.provider,
          enabled: !!p.enabled,
          models: Array.isArray(p.models) ? p.models : [],
          visionModels: Array.isArray(p.visionModels) ? p.visionModels : (Array.isArray(p.vision_models) ? p.vision_models : []),
          priority: Number(p.priority) || 10,
        })),
      };
      const res = await api.putWithAuth('/admin/assistant/config', body, token);
      if (!res || !res.success) throw new Error((res && res.message) || 'Lưu thất bại');
      setProviders(Array.isArray(res.data.providers) ? res.data.providers : []);
      showToast('Đã lưu cấu hình trợ lý');
    } catch (err) {
      setError(err.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    const q = testQ.trim();
    if (!q || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.postWithAuth('/admin/assistant/test', { question: q, provider: testProvider }, token);
      if (!res || !res.success) throw new Error((res && res.message) || 'Test thất bại');
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ error: err.message || 'Test thất bại' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <p className="text-sm text-base-content/60">Đang tải cấu hình trợ lý...</p>;

  return (
    <div className="space-y-4">
      {error && <div className="alert alert-error py-2 px-3"><span className="text-sm">{error}</span></div>}
      {toast && <div className="alert alert-success py-2 px-3"><span className="text-sm">{toast}</span></div>}

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body p-4 space-y-2">
          <h3 className="font-semibold text-sm inline-flex items-center gap-1.5"><GripVertical size={14} /> Thứ tự fallback (kéo-thả để đổi)</h3>
          <DragDropList
            items={providers.slice().sort((a, b) => a.priority - b.priority).map((p) => ({ id: p.provider, ...p }))}
            onReorder={reorderFallback}
            renderItem={(item, index) => (
              <span className="flex items-center gap-2 text-sm">
                <span className="badge badge-sm badge-primary">{index + 1}</span>
                <span className="font-medium">{PROVIDER_LABEL[item.provider] || item.provider}</span>
                {!item.enabled && <span className="badge badge-xs badge-ghost">tắt (bỏ qua)</span>}
                {!item.keyConfigured && <span className="badge badge-xs badge-error">chưa có key</span>}
              </span>
            )}
          />
          <p className="text-xs text-base-content/50">Models trống = dùng biến môi trường. API key luôn nằm trong file <code>.env</code>, không quản lý ở đây.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {providers.slice().sort((a, b) => a.priority - b.priority).map((p) => (
          <ProviderCard
            key={p.provider}
            provider={p}
            listState={modelLists[p.provider] || {}}
            freeOnly={freeOnly}
            setFreeOnly={setFreeOnly}
            onToggle={(v) => patchProvider(p.provider, { enabled: v })}
            onModels={(v) => setModels(p.provider, 'models', v)}
            onVisionModels={(v) => setModels(p.provider, 'visionModels', v)}
            onReloadList={() => loadModels(p.provider, true)}
          />
        ))}
      </div>

      <button type="button" className="btn btn-sm btn-primary gap-1" onClick={save} disabled={saving}>
        <Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
      </button>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold text-sm inline-flex items-center gap-1.5"><FlaskConical size={14} /> Hỏi thử trực tiếp</h3>
          <p className="text-xs text-base-content/50">Chạy đúng pipeline (guard + truy hồi + fallback đã lưu), không ghi log. Mỗi lượt test tốn quota AI.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="input input-bordered input-sm flex-1"
              placeholder="Nhập câu hỏi thử..."
              value={testQ}
              onChange={(e) => setTestQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runTest(); }}
              disabled={testing}
            />
            <select className="select select-bordered select-sm sm:w-40" value={testProvider} onChange={(e) => setTestProvider(e.target.value)} disabled={testing}>
              <option value="auto">Tự động (fallback)</option>
              <option value="gemini">Ép Gemini</option>
              <option value="openrouter">Ép OpenRouter</option>
            </select>
            <button type="button" className="btn btn-sm btn-secondary" onClick={runTest} disabled={testing || !testQ.trim()}>
              {testing ? 'Đang hỏi...' : 'Hỏi thử'}
            </button>
          </div>
          {testResult && (
            <div className="rounded-lg border border-base-300 bg-base-200/40 p-3 text-sm space-y-2">
              {testResult.error ? (
                <p className="text-error">{testResult.error}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {testResult.provider && <span className="badge badge-xs badge-info">{testResult.provider}</span>}
                    {testResult.model && <span className="badge badge-xs badge-ghost">{testResult.model}</span>}
                    {testResult.latencyMs != null && <span className="badge badge-xs badge-ghost">{testResult.latencyMs}ms</span>}
                    {testResult.fallbackReason && <span className="badge badge-xs badge-warning">fallback</span>}
                  </div>
                  <MarkdownText text={testResult.answer || ''} />
                  {Array.isArray(testResult.sources) && testResult.sources.length > 0 && (
                    <p className="text-xs text-base-content/60">Nguồn: {testResult.sources.map((s) => `#${s.slug}`).join(', ')}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
