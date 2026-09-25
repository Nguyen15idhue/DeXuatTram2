import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { documentService } from '../../services/api';
import { FileText, Plus, X, Trash2, Pencil, Network, LayoutTemplate } from 'lucide-react';
import Loading from '../../components/Loading';
import DocumentTemplateEditor from '../../components/admin/DocumentTemplateEditor';
import DocumentLayoutEditor from '../../components/admin/DocumentLayoutEditor';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';

const emptyForm = { name: '', entity: 'station_proposals', model: '', file_id: '', status: 'active', is_default: false };

const AdminDocumentsPage = () => {
  const { token } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [constants, setConstants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [mapModal, setMapModal] = useState({ open: false, id: null, name: '', text: '' });
  const [constSaving, setConstSaving] = useState(false);
  const [editorId, setEditorId] = useState(null);
  const [layoutTpl, setLayoutTpl] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [tRes, cRes] = await Promise.all([
        documentService.listTemplates(token),
        documentService.listConstants(token)
      ]);
      if (tRes.success) setTemplates(tRes.data || []);
      else setError(tRes.message || 'Lỗi tải templates');
      if (cRes.success) setConstants(cRes.data || []);
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({
      name: t.name || '',
      entity: t.entity || 'station_proposals',
      model: t.model || '',
      file_id: t.file_id || '',
      status: t.status || 'active',
      is_default: !!t.is_default
    });
    setShowForm(true);
  };

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      setToast({ message: 'Chỉ chấp nhận file .docx', type: 'error' });
      return;
    }
    try {
      setUploading(true);
      const res = await documentService.uploadTemplateFile(file, token);
      if (res.success) {
        setForm((prev) => ({ ...prev, file_id: res.data.id }));
        setToast({ message: `Đã upload: ${res.data.original_name || file.name}`, type: 'success' });
      } else {
        setToast({ message: res.message || 'Upload thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi upload file', type: 'error' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setToast({ message: 'Vui lòng nhập tên template', type: 'error' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        entity: form.entity || 'station_proposals',
        model: form.model || null,
        file_id: form.file_id ? Number(form.file_id) : null,
        status: form.status,
        is_default: !!form.is_default
      };
      const res = editingId
        ? await documentService.updateTemplate(editingId, payload, token)
        : await documentService.createTemplate(payload, token);
      if (res.success) {
        setToast({ message: editingId ? 'Cập nhật thành công' : 'Tạo thành công', type: 'success' });
        setShowForm(false);
        loadAll();
      } else {
        setToast({ message: res.message || 'Lưu thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await documentService.deleteTemplate(id, token);
      if (res.success) {
        setToast({ message: 'Đã xóa template', type: 'success' });
        loadAll();
      } else {
        setToast({ message: res.message || 'Xóa thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
  };

  const openMapping = (t) => {
    setMapModal({ open: true, id: t.id, name: t.name, text: JSON.stringify(t.mapping || {}, null, 2) });
  };

  const saveMapping = async () => {
    let parsed;
    try {
      parsed = mapModal.text.trim() ? JSON.parse(mapModal.text) : {};
    } catch {
      setToast({ message: 'Mapping không phải JSON hợp lệ', type: 'error' });
      return;
    }
    try {
      const res = await documentService.updateTemplate(mapModal.id, { mapping: parsed }, token);
      if (res.success) {
        setToast({ message: 'Đã lưu mapping', type: 'success' });
        setMapModal({ open: false, id: null, name: '', text: '' });
        loadAll();
      } else {
        setToast({ message: res.message || 'Lưu thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
  };

  const [newConst, setNewConst] = useState({ key: '', label: '', value: '' });
  const [confirmConst, setConfirmConst] = useState({ isOpen: false, key: '', label: '' });

  const addConstant = () => {
    const key = newConst.key.trim().replace(/\s+/g, '_');
    if (!key) {
      setToast({ message: 'Nhập key cho hằng số mới', type: 'error' });
      return;
    }
    if (constants.some((c) => c.key === key)) {
      setToast({ message: 'Key đã tồn tại', type: 'error' });
      return;
    }
    setConstants((prev) => [...prev, { key, label: newConst.label.trim() || key, value: newConst.value, group_name: null }]);
    setNewConst({ key: '', label: '', value: '' });
    setToast({ message: 'Đã thêm — bấm Lưu hằng số để ghi nhận', type: 'success' });
  };

  const handleDeleteConstant = async () => {
    const { key } = confirmConst;
    setConfirmConst({ isOpen: false, key: '', label: '' });
    try {
      const res = await documentService.deleteConstant(key, token);
      if (res.success) {
        setConstants((prev) => prev.filter((c) => c.key !== key));
        setToast({ message: 'Đã xóa hằng số', type: 'success' });
      } else {
        setToast({ message: res.message || 'Xóa thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
  };

  const saveConstants = async () => {
    try {
      setConstSaving(true);
      const items = constants.map((c) => ({ key: c.key, label: c.label, value: c.value, group_name: c.group_name }));
      const res = await documentService.updateConstants(items, token);
      if (res.success) {
        setConstants(res.data || []);
        setToast({ message: 'Đã lưu hằng số', type: 'success' });
      } else {
        setToast({ message: res.message || 'Lưu thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setConstSaving(false);
    }
  };

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <FileText size={24} className="text-primary shrink-0" />
          <h1 className="text-2xl font-bold">Quản lý tài liệu</h1>
        </div>
        <button className="btn btn-primary btn-sm gap-1" onClick={openCreate}>
          <Plus size={14} />
          Thêm template
        </button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadAll(); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa template"
        message={`Bạn có chắc chắn muốn xóa template "${confirmDelete.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="bg-base-100 rounded-lg border border-base-300 overflow-x-auto mb-6">
            <table className="table table-sm w-full">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Mô hình</th>
                  <th>File</th>
                  <th>Mặc định</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 && (
                  <tr><td colSpan={6} className="text-center opacity-60 py-6">Chưa có template nào</td></tr>
                )}
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">{t.name}</td>
                    <td>{t.model || <span className="opacity-50">Chung</span>}</td>
                    <td>{t.file_name || <span className="opacity-50">Chưa có file</span>}</td>
                    <td>{t.is_default ? <span className="badge badge-primary badge-sm">Mặc định</span> : ''}</td>
                    <td>
                      <span className={`badge badge-sm ${t.status === 'active' ? 'badge-success' : 'badge-ghost'}`}>
                        {t.status === 'active' ? 'Hoạt động' : 'Tắt'}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-primary btn-xs gap-1" onClick={() => setEditorId(t.id)} title="Mở editor kéo-thả">
                        <Pencil size={13} /> Gán trường
                      </button>
                      <button className="btn btn-ghost btn-xs gap-1" onClick={() => openMapping(t)} title="Xem/sửa mapping JSON">
                        <Network size={13} /> Mapping
                      </button>
                      <button className="btn btn-ghost btn-xs gap-1" onClick={() => setLayoutTpl(t)} title="Sửa bố cục Word (thêm/xóa/căn trường)">
                        <LayoutTemplate size={13} /> Bố cục
                      </button>
                      <button className="btn btn-ghost btn-xs gap-1" onClick={() => openEdit(t)} title="Sửa">
                        <Pencil size={13} /> Sửa
                      </button>
                      <button className="btn btn-ghost btn-xs text-error gap-1" onClick={() => setConfirmDelete({ isOpen: true, id: t.id, name: t.name })} title="Xóa">
                        <Trash2 size={13} /> Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-base-100 rounded-lg border border-base-300 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold">Hằng số dùng chung</h2>
              <button className="btn btn-primary btn-sm" onClick={saveConstants} disabled={constSaving}>
                {constSaving ? 'Đang lưu...' : 'Lưu hằng số'}
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {constants.map((c, idx) => (
                <div key={c.key} className="flex items-center gap-2">
                  <span className="text-sm w-48 shrink-0 truncate" title={c.key}>{c.label || c.key}</span>
                  <input
                    className="input input-bordered input-sm flex-1 min-w-0"
                    value={c.value || ''}
                    onChange={(e) => setConstants((prev) => prev.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))}
                  />
                  <button type="button" className="btn btn-ghost btn-xs text-error shrink-0" title={`Xóa ${c.key}`}
                    onClick={() => setConfirmConst({ isOpen: true, key: c.key, label: c.label || c.key })}>✕</button>
                </div>
              ))}
              {constants.length === 0 && <div className="opacity-60 text-sm">Chưa có hằng số</div>}
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <input className="input input-bordered input-sm w-40 font-mono" placeholder="key mới (vd so_van_ban)"
                value={newConst.key} onChange={(e) => setNewConst((prev) => ({ ...prev, key: e.target.value }))} />
              <input className="input input-bordered input-sm w-48" placeholder="Tên hiển thị"
                value={newConst.label} onChange={(e) => setNewConst((prev) => ({ ...prev, label: e.target.value }))} />
              <input className="input input-bordered input-sm flex-1 min-w-40" placeholder="Giá trị"
                value={newConst.value} onChange={(e) => setNewConst((prev) => ({ ...prev, value: e.target.value }))} />
              <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={addConstant}>+ Thêm</button>
            </div>
            <ConfirmDialog
              isOpen={confirmConst.isOpen}
              title="Xóa hằng số"
              message={`Xóa hằng số "${confirmConst.label}"? Các token đang dùng key này sẽ render trống.`}
              onConfirm={handleDeleteConstant}
              onCancel={() => setConfirmConst({ isOpen: false, key: '', label: '' })}
              confirmText="Xóa"
              type="danger"
            />
          </div>
        </>
      )}

      {showForm && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">{editingId ? 'Sửa template' : 'Thêm template'}</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowForm(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="form-control">
                <label className="label"><span className="label-text">Tên template *</span></label>
                <input className="input input-bordered w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Báo cáo đề xuất TDT" />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Mô hình</span></label>
                <select className="select select-bordered w-full" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                  <option value="">Chung (mọi mô hình)</option>
                  <option value="TDT">TDT — Tự đầu tư</option>
                  <option value="NQ">NQ — Nhượng quyền</option>
                  <option value="LK">LK — Liên kết</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">File .docx mẫu</span></label>
                <input type="file" accept=".docx" className="file-input file-input-bordered w-full" onChange={handleFile} disabled={uploading} />
                {uploading && <div className="text-xs opacity-70 mt-1">Đang upload...</div>}
                {form.file_id && <div className="text-xs text-success mt-1">Đã gắn file ID: {form.file_id}</div>}
              </div>
              <div className="flex items-center gap-4">
                <label className="label cursor-pointer gap-2">
                  <span className="label-text">Mặc định</span>
                  <input type="checkbox" className="checkbox checkbox-sm" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                </label>
                <select className="select select-bordered select-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Tắt</option>
                </select>
              </div>
              <div className="modal-action">
                <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Hủy</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || uploading}>
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowForm(false)}>close</button>
          </form>
        </dialog>
      )}

      {layoutTpl && (
        <DocumentLayoutEditor
          templateId={layoutTpl.id}
          templateName={layoutTpl.name}
          onClose={() => setLayoutTpl(null)}
          onSaved={() => loadAll()}
        />
      )}

      {editorId && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-6xl">
            <DocumentTemplateEditor
              templateId={editorId}
              onClose={() => setEditorId(null)}
              onSaved={() => loadAll()}
            />
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setEditorId(null)}>close</button>
          </form>
        </dialog>
      )}

      {mapModal.open && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Mapping — {mapModal.name}</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setMapModal({ open: false, id: null, name: '', text: '' })}>
                <X size={18} />
              </button>
            </div>
            <p className="text-xs opacity-70 mb-2">JSON mapping tokens/loops (editor kéo-thả ở Phase 2).</p>
            <textarea
              className="textarea textarea-bordered w-full font-mono text-xs"
              rows={14}
              value={mapModal.text}
              onChange={(e) => setMapModal((prev) => ({ ...prev, text: e.target.value }))}
            />
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setMapModal({ open: false, id: null, name: '', text: '' })}>Hủy</button>
              <button className="btn btn-primary" onClick={saveMapping}>Lưu mapping</button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setMapModal({ open: false, id: null, name: '', text: '' })}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
};

export default AdminDocumentsPage;
