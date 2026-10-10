import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { automationService } from '../../services/api';
import Toast from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';
import { Plus, Trash2, Save, ChevronDown, ChevronRight, Lock } from 'lucide-react';

const FIELD_KINDS = [
  { value: 'static', label: 'Chữ tĩnh' },
  { value: 'node', label: 'Trường node (node.<id>.<...>)' },
  { value: 'process', label: 'Trường quy trình (process.<...>)' },
  { value: 'contact', label: 'Trường liên hệ (contact.<...>)' },
];

const slugKey = (title) => {
  const s = String(title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return `custom_${s || 'node'}`;
};

const emptyField = () => ({ key: '', label: '', kind: 'static', ref: '', text: '' });
const emptyGroup = (template) => ({ action: '', template: template || '', members: [], exclude: [] });

const SpecialNodesPanel = ({ tree, template }) => {
  const { token } = useAuth();
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await automationService.specialNodesList(token);
      if (res.success) {
        const list = res.data || [];
        setNodes(list);
        const d = {};
        list.forEach((n) => {
          d[n.node_key] = {
            title: n.title,
            fields: (n.fields || []).map((f) => ({ ...f })),
            groups: normalizeGroups(((n.config || {}).groups || [])),
          };
        });
        setDrafts(d);
      } else {
        setToast({ message: res.message || 'Lỗi tải node đặc biệt', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const treeNodes = useMemo(() => {
    const all = (tree && tree.nodes) || [];
    return all
      .filter((n) => n && ['taskaction', 'tasksign', 'http', 'task'].includes(n.type))
      .map((n) => ({ id: n.id, title: n.title || n.id, type: n.type, fields: (n.fields || []).map((f) => f.path).filter(Boolean) }));
  }, [tree]);

  const fieldOptionsOf = (nodeId) => {
    const n = treeNodes.find((x) => String(x.id) === String(nodeId));
    const rests = new Set(['status', 'end_plan', 'end_real']);
    (n?.fields || []).forEach((p) => {
      const parts = String(p).split('.');
      if (parts.length >= 3) rests.add(parts.slice(2).join('.'));
    });
    const labelOf = (r) => (r === 'status' ? 'Trạng thái (mặc định)' : r === 'end_plan' ? 'Deadline dự kiến' : r === 'end_real' ? 'Deadline thực tế' : r);
    return [...rests].map((r) => ({ value: r, label: labelOf(r) }));
  };

  const normalizeGroups = (groups) => (groups || []).map((g) => {
    const members = Array.isArray(g.members) && g.members.length > 0
      ? g.members.filter((m) => m && m.node).map((m) => ({ node: String(m.node), field: String(m.field || 'status') || 'status' }))
      : (g.nodes || []).map((n) => ({ node: String(n), field: 'status' }));
    return { action: g.action || '', template: g.template || '', members, exclude: [...(g.exclude || [])] };
  });

  const nodeOptions = useMemo(
    () => treeNodes.map((n) => ({ value: n.id, label: `${n.title} (${n.id})` })),
    [treeNodes]
  );

  const nodeTitleOf = (id) => {
    const f = treeNodes.find((n) => String(n.id) === String(id));
    return f ? `${f.title} (${f.id})` : String(id);
  };

  const setDraft = (key, patch) => setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const saveNode = async (node) => {
    const d = drafts[node.node_key] || {};
    setSavingKey(node.node_key);
    try {
      const body = { title: d.title };
      if (!node.deletable && node.node_key === 'latest_status') {
        body.config = { groups: d.groups || [] };
      }
      if (node.deletable) {
        body.fields = d.fields || [];
      }
      const res = await automationService.specialNodesUpdate(node.node_key, body, token);
      if (res.success) {
        setToast({ message: `Đã lưu node "${d.title}"`, type: 'success' });
        load();
      } else {
        setToast({ message: res.message || 'Lưu thất bại', type: 'error' });
      }
    } catch (e) {
      setToast({ message: e.message || 'Lỗi kết nối server', type: 'error' });
    } finally {
      setSavingKey(null);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) { setToast({ message: 'Nhập tên node', type: 'error' }); return; }
    setCreating(true);
    try {
      const res = await automationService.specialNodesCreate({ title: newTitle.trim(), fields: [{ ...emptyField(), key: 'value', label: 'Giá trị' }] }, token);
      if (res.success) {
        setToast({ message: `Đã tạo node "${newTitle.trim()}" (${res.data.node_key})`, type: 'success' });
        setNewTitle('');
        load();
      } else {
        setToast({ message: res.message || 'Tạo thất bại', type: 'error' });
      }
    } catch (e) {
      setToast({ message: e.message || 'Lỗi kết nối server', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await automationService.specialNodesDelete(confirmDelete.node_key, token);
      if (res.success) {
        setToast({ message: 'Đã xóa node', type: 'success' });
        setConfirmDelete(null);
        load();
      } else {
        setToast({ message: res.message || 'Xóa thất bại', type: 'error' });
      }
    } catch (e) {
      setToast({ message: e.message || 'Lỗi kết nối server', type: 'error' });
    }
  };

  const toggleNodeIds = (key, listName, id) => {
    const d = drafts[key] || {};
    const list = [...(d[listName] || [])];
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    setDraft(key, { [listName]: list });
  };

  const setGroup = (nodeKey, gi, patch) => {
    const d = drafts[nodeKey] || {};
    const groups = [...(d.groups || [])];
    groups[gi] = { ...groups[gi], ...patch };
    setDraft(nodeKey, { groups });
  };

  const setGroupMembers = (nodeKey, gi, ids) => {
    const d = drafts[nodeKey] || {};
    const groups = [...(d.groups || [])];
    const prev = {};
    (groups[gi].members || []).forEach((m) => { prev[m.node] = m.field; });
    groups[gi] = { ...groups[gi], members: ids.map((id) => ({ node: id, field: prev[id] || 'status' })) };
    setDraft(nodeKey, { groups });
  };

  const setMemberField = (nodeKey, gi, nodeId, field) => {
    const d = drafts[nodeKey] || {};
    const groups = [...(d.groups || [])];
    groups[gi] = {
      ...groups[gi],
      members: (groups[gi].members || []).map((m) => (m.node === nodeId ? { ...m, field } : m)),
    };
    setDraft(nodeKey, { groups });
  };

  const renderGroupEditor = (nodeKey, gi, g) => (
    <div key={gi} className="border border-base-300 rounded-lg p-2 space-y-2 bg-base-50">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="form-control">
          <span className="label-text text-xs">Tên hành động *</span>
          <input
            className="input input-bordered input-sm w-full"
            value={g.action || ''}
            onChange={(e) => setGroup(nodeKey, gi, { action: e.target.value })}
            placeholder="VD: Chấm điểm"
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Mẫu quy trình (để trống = mọi mẫu)</span>
          <input
            className="input input-bordered input-sm w-full"
            value={g.template || ''}
            onChange={(e) => setGroup(nodeKey, gi, { template: e.target.value })}
            placeholder={template || '[EGR] Quy trình đánh giá đầu tư'}
          />
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <span className="label-text text-xs">Node trong nhóm ({(g.members || []).length})</span>
          <SearchableMultiSelect
            options={nodeOptions}
            values={(g.members || []).map((m) => m.node)}
            onChange={(next) => setGroupMembers(nodeKey, gi, next)}
            placeholder="-- Chọn node --"
          />
          {treeNodes.length === 0 && <span className="text-xs opacity-60">Mở tab Mapping 2 cột để tải cây node trước.</span>}
        </div>
        <div>
          <span className="label-text text-xs">Trường trong node (mặc định: Trạng thái)</span>
          <div className="space-y-1 mt-1">
            {(g.members || []).length === 0 && <div className="text-xs opacity-60">Chọn node trước.</div>}
            {(g.members || []).map((m) => (
              <div key={m.node} className="flex items-center gap-1">
                <span className="text-xs truncate flex-1" title={nodeTitleOf(m.node)}>{nodeTitleOf(m.node)}</span>
                <select
                  className="select select-bordered select-xs max-w-[190px]"
                  value={m.field || 'status'}
                  onChange={(e) => setMemberField(nodeKey, gi, m.node, e.target.value)}
                >
                  {fieldOptionsOf(m.node).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <span className="label-text text-xs">Loại trừ (node nhảy tắt, không xét) ({(g.exclude || []).length})</span>
        <SearchableMultiSelect
          options={nodeOptions}
          values={g.exclude || []}
          onChange={(next) => setGroup(nodeKey, gi, { exclude: next })}
          placeholder="-- Chọn node loại trừ --"
        />
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-xs text-error"
        onClick={() => {
          const d = drafts[nodeKey] || {};
          setDraft(nodeKey, { groups: (d.groups || []).filter((_, i) => i !== gi) });
        }}
      >
        <Trash2 size={12} /> Xóa nhóm
      </button>
    </div>
  );

  const renderFieldEditor = (nodeKey, fi, f) => (
    <div key={fi} className="grid grid-cols-12 gap-1 items-end border border-base-200 rounded p-1.5 bg-base-50">
      <label className="form-control col-span-3">
        <span className="label-text text-xs">Key</span>
        <input
          className="input input-bordered input-xs w-full"
          value={f.key || ''}
          onChange={(e) => {
            const d = drafts[nodeKey] || {};
            const fields = [...(d.fields || [])];
            fields[fi] = { ...f, key: e.target.value };
            setDraft(nodeKey, { fields });
          }}
          placeholder="value"
        />
      </label>
      <label className="form-control col-span-3">
        <span className="label-text text-xs">Nhãn</span>
        <input
          className="input input-bordered input-xs w-full"
          value={f.label || ''}
          onChange={(e) => {
            const d = drafts[nodeKey] || {};
            const fields = [...(d.fields || [])];
            fields[fi] = { ...f, label: e.target.value };
            setDraft(nodeKey, { fields });
          }}
          placeholder="Giá trị"
        />
      </label>
      <label className="form-control col-span-3">
        <span className="label-text text-xs">Loại</span>
        <select
          className="select select-bordered select-xs w-full"
          value={f.kind || 'static'}
          onChange={(e) => {
            const d = drafts[nodeKey] || {};
            const fields = [...(d.fields || [])];
            fields[fi] = { ...f, kind: e.target.value };
            setDraft(nodeKey, { fields });
          }}
        >
          {FIELD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </label>
      <label className="form-control col-span-2">
        <span className="label-text text-xs">{f.kind === 'static' ? 'Chữ' : 'Ref'}</span>
        <input
          className="input input-bordered input-xs w-full"
          value={f.kind === 'static' ? (f.text || '') : (f.ref || '')}
          onChange={(e) => {
            const d = drafts[nodeKey] || {};
            const fields = [...(d.fields || [])];
            fields[fi] = f.kind === 'static' ? { ...f, text: e.target.value } : { ...f, ref: e.target.value };
            setDraft(nodeKey, { fields });
          }}
          placeholder={f.kind === 'static' ? 'Nội dung' : f.kind === 'node' ? 'node.n41.status' : f.kind === 'process' ? 'title' : 'doi_tac'}
        />
      </label>
      <button
        type="button"
        className="btn btn-ghost btn-xs text-error col-span-1"
        onClick={() => {
          const d = drafts[nodeKey] || {};
          setDraft(nodeKey, { fields: (d.fields || []).filter((_, i) => i !== fi) });
        }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );

  if (loading) {
    return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  const defaults = nodes.filter((n) => n.is_default);
  const customs = nodes.filter((n) => !n.is_default);

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Xóa node đặc biệt"
        message={`Xóa node "${confirmDelete?.title}"? Các cột Sheet đang map tới node này sẽ trống cho tới khi map lại.`}
        confirmText="Xóa"
        type="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body">
          <h4 className="font-semibold mb-1">Node mặc định (không xóa được, chỉ sửa tên{ ' ' }và cấu hình cho phép)</h4>
          <p className="text-xs text-base-content/60 mb-3">
            Node Liên hệ chỉ sửa tên (trường dựng động từ form đề xuất). Node Trạng thái mới nhất sửa tên + các nhóm hành động bên dưới.
          </p>
          <div className="space-y-3">
            {defaults.map((n) => {
              const d = drafts[n.node_key] || {};
              const open = expanded[n.node_key] !== false;
              return (
                <div key={n.node_key} className="border border-base-300 rounded-lg">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setExpanded((p) => ({ ...p, [n.node_key]: !open }))}>
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <Lock size={13} className="text-warning" />
                    <code className="text-xs opacity-60">{n.node_key}</code>
                    <input
                      className="input input-bordered input-sm flex-1"
                      value={d.title || ''}
                      onChange={(e) => setDraft(n.node_key, { title: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm gap-1"
                      disabled={savingKey === n.node_key}
                      onClick={() => saveNode(n)}
                    >
                      <Save size={14} /> {savingKey === n.node_key ? 'Đang lưu...' : 'Lưu'}
                    </button>
                  </div>
                  {open && n.node_key === 'latest_status' && (
                    <div className="px-3 pb-3 space-y-2">
                      <div className="text-xs font-medium">Nhóm hành động ({(d.groups || []).length}) — trong nhóm lấy trạng thái tiêu cực nhất, giữa các nhóm lấy nhóm có node mới nhất</div>
                      {(d.groups || []).map((g, gi) => renderGroupEditor(n.node_key, gi, g))}
                      <button
                        type="button"
                        className="btn btn-outline btn-xs gap-1"
                        onClick={() => setDraft(n.node_key, { groups: [...(d.groups || []), emptyGroup(template)] })}
                      >
                        <Plus size={12} /> Thêm nhóm
                      </button>
                    </div>
                  )}
                  {open && n.node_key === 'contact' && (
                    <div className="px-3 pb-3 text-xs text-base-content/60">
                      {(n.fields || []).length} trường, dựng động từ form đề xuất (xem ở Cột 1 — Trường 1Office).
                    </div>
                  )}
                </div>
              );
            })}
            {defaults.length === 0 && <div className="text-sm opacity-60">Chưa có node mặc định.</div>}
          </div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body">
          <h4 className="font-semibold mb-2">Node tự tạo</h4>
          <div className="flex gap-2 mb-3">
            <input
              className="input input-bordered input-sm flex-1"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Tên node mới (VD: Tổng hợp ký duyệt)"
            />
            <button type="button" className="btn btn-primary btn-sm gap-1" disabled={creating} onClick={handleCreate}>
              <Plus size={14} /> {creating ? 'Đang tạo...' : 'Thêm node'}
            </button>
          </div>
          <div className="space-y-3">
            {customs.map((n) => {
              const d = drafts[n.node_key] || {};
              const open = expanded[n.node_key] === true;
              return (
                <div key={n.node_key} className="border border-base-300 rounded-lg">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setExpanded((p) => ({ ...p, [n.node_key]: !open }))}>
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <code className="text-xs opacity-60">{n.node_key}</code>
                    <input
                      className="input input-bordered input-sm flex-1"
                      value={d.title || ''}
                      onChange={(e) => setDraft(n.node_key, { title: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm gap-1"
                      disabled={savingKey === n.node_key}
                      onClick={() => saveNode(n)}
                    >
                      <Save size={14} /> {savingKey === n.node_key ? 'Đang lưu...' : 'Lưu'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-error btn-outline btn-sm gap-1"
                      onClick={() => setConfirmDelete(n)}
                    >
                      <Trash2 size={14} /> Xóa
                    </button>
                  </div>
                  {open && (
                    <div className="px-3 pb-3 space-y-2">
                      <div className="text-xs font-medium">Trường ({(d.fields || []).length}) — path dạng <code>{n.node_key}.&lt;key&gt;</code></div>
                      {(d.fields || []).map((f, fi) => renderFieldEditor(n.node_key, fi, f))}
                      <button
                        type="button"
                        className="btn btn-outline btn-xs gap-1"
                        onClick={() => setDraft(n.node_key, { fields: [...(d.fields || []), emptyField()] })}
                      >
                        <Plus size={12} /> Thêm trường
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {customs.length === 0 && <div className="text-sm opacity-60">Chưa có node tự tạo.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpecialNodesPanel;
