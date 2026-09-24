import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Pencil, Trash2, Eye, Upload, Archive, RefreshCw, BookOpen, Film,
  Table as TableIcon, LayoutGrid,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { adminHelpApi, clearHelpCache } from '../../services/helpApi';
import { VideoBlock, Gallery } from '../../components/help/HelpMedia';
import HelpEditor from '../../components/admin/HelpEditor';
import HelpGuideBoard from '../../components/admin/HelpGuideBoard';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/Pagination';

const STATUS_LABEL = { draft: 'Nháp', published: 'Đã xuất bản', archived: 'Lưu trữ' };
const STATUS_VARIANT = { draft: 'warning', published: 'success', archived: 'neutral' };

const AdminHelpPage = () => {
  const { token } = useAuth();
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const [editing, setEditing] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [presetCategoryId, setPresetCategoryId] = useState(null);

  const catTitle = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.id] = c.title;
    return m;
  }, [categories]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [arts, cats] = await Promise.all([
        adminHelpApi.list({ status: statusFilter, category: catFilter, q: debouncedSearch }, token),
        adminHelpApi.categories(token),
      ]);
      setArticles(arts);
      setCategories(cats);
    } catch (err) {
      setError(err.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, catFilter, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, catFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(articles.length / pageSize));
  const pagedArticles = useMemo(
    () => articles.slice((page - 1) * pageSize, page * pageSize),
    [articles, page, pageSize]
  );

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const openCreate = (categoryId) => {
    setEditing(null);
    setPresetCategoryId(categoryId ?? null);
    setEditorOpen(true);
  };
  const openEdit = async (row) => {
    try {
      const full = await adminHelpApi.get(row.id, token);
      setEditing(full);
      setEditorOpen(true);
    } catch (err) {
      setError(err.message || 'Không mở được bài viết');
    }
  };
  const onSaved = (saved) => {
    setEditorOpen(false);
    setEditing(null);
    setPresetCategoryId(null);
    clearHelpCache();
    showToast(`Đã lưu "${saved.title}"`);
    load();
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await adminHelpApi.remove(confirmDelete.id, token);
      clearHelpCache();
      showToast('Đã xóa bài viết');
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(err.message || 'Xóa thất bại');
      setConfirmDelete(null);
    }
  };
  const changeStatus = async (row, action) => {
    try {
      if (action === 'publish') await adminHelpApi.publish(row.id, token);
      else await adminHelpApi.archive(row.id, token);
      clearHelpCache();
      showToast(action === 'publish' ? 'Đã xuất bản' : 'Đã lưu trữ');
      load();
    } catch (err) {
      setError(err.message || 'Đổi trạng thái thất bại');
    }
  };

  const columns = useMemo(() => [
    { key: 'title', label: 'Tiêu đề', sortable: false, render: (value, row) => (
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[320px]">{row.title}</p>
        <p className="text-xs text-base-content/50">/{row.slug}{row.legacy_id ? ` · ${row.legacy_id}` : ''}</p>
      </div>
    ) },
    { key: 'category_title', label: 'Danh mục', render: (value, row) => catTitle[row.category_id] || <span className="text-base-content/40">—</span> },
    { key: 'status', label: 'Trạng thái', render: (value) => <Badge variant={STATUS_VARIANT[value]} size="sm">{STATUS_LABEL[value]}</Badge> },
    { key: 'roles', label: 'Vai trò', render: (value, row) => {
      const roles = Array.isArray(row.roles) ? row.roles : [];
      if (roles.length === 0) return <span className="text-base-content/40">Tất cả</span>;
      return <div className="flex flex-wrap gap-0.5">{roles.slice(0, 3).map((r) => <span key={r} className="badge badge-xs">{r}</span>)}{roles.length > 3 && <span className="badge badge-xs">+{roles.length - 3}</span>}</div>;
    } },
    { key: 'videos', label: 'Video', render: (value, row) => {
      const n = Array.isArray(row.videos) ? row.videos.length : 0;
      return n > 0 ? <span className="inline-flex items-center gap-1 text-xs"><Film size={12} /> {n}</span> : <span className="text-base-content/40">—</span>;
    } },
    { key: 'view_count', label: 'Lượt xem', render: (value) => value },
    { key: 'updated_at', label: 'Cập nhật', render: (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '—' },
  ], [catTitle]);

  const actions = (row) => (
    <div className="flex items-center gap-1 justify-center">
      <button type="button" className="btn btn-xs btn-ghost" title="Xem trước" onClick={() => setPreview(row)}><Eye size={14} /></button>
      <button type="button" className="btn btn-xs btn-ghost" title="Sửa" onClick={() => openEdit(row)}><Pencil size={14} /></button>
      {row.status !== 'published' && <button type="button" className="btn btn-xs btn-ghost text-success" title="Xuất bản" onClick={() => changeStatus(row, 'publish')}><Upload size={14} /></button>}
      {row.status === 'published' && <button type="button" className="btn btn-xs btn-ghost text-warning" title="Lưu trữ" onClick={() => changeStatus(row, 'archive')}><Archive size={14} /></button>}
      <button type="button" className="btn btn-xs btn-ghost text-error" title="Xóa" onClick={() => setConfirmDelete(row)}><Trash2 size={14} /></button>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quản lý Hướng dẫn"
        subtitle="Thêm, sửa, xóa bài hướng dẫn. Nội dung hiển thị ở trang Hướng dẫn cho mọi vai trò được chọn."
        actions={(
          <>
            <div role="tablist" className="tabs tabs-boxed tabs-sm">
              <button type="button" role="tab" className={`tab gap-1 ${viewMode === 'table' ? 'tab-active' : ''}`} onClick={() => setViewMode('table')}>
                <TableIcon size={13} /> Bảng
              </button>
              <button type="button" role="tab" className={`tab gap-1 ${viewMode === 'guide' ? 'tab-active' : ''}`} onClick={() => setViewMode('guide')}>
                <LayoutGrid size={13} /> Hướng dẫn
              </button>
            </div>
            <button type="button" className="btn btn-sm btn-ghost gap-1" onClick={load} disabled={loading}><RefreshCw size={14} /> Tải lại</button>
            <button type="button" className="btn btn-sm btn-primary gap-1" onClick={() => openCreate(null)}><Plus size={14} /> Thêm bài</button>
          </>
        )}
      />

      {error && <div className="alert alert-error py-2 px-3"><span className="text-sm">{error}</span></div>}
      {toast && <div className="alert alert-success py-2 px-3"><span className="text-sm">{toast}</span></div>}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input className="input input-bordered input-sm w-full pl-9" placeholder="Tìm theo tiêu đề / slug / mã cũ..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select select-bordered select-sm sm:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="published">Đã xuất bản</option>
          <option value="archived">Lưu trữ</option>
        </select>
        <select className="select select-bordered select-sm sm:w-56" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.title}</option>)}
        </select>
        {viewMode === 'table' && (
          <select className="select select-bordered select-sm w-28" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={10}>10 / trang</option>
            <option value={20}>20 / trang</option>
            <option value={50}>50 / trang</option>
            <option value={100}>100 / trang</option>
          </select>
        )}
      </div>

      {viewMode === 'table' ? (
        <>
          <DataTable columns={columns} data={pagedArticles} loading={loading} actions={actions} startIndex={(page - 1) * pageSize} emptyMessage="Chưa có bài hướng dẫn nào" />
          <Pagination page={page} totalPages={totalPages} total={articles.length} onPageChange={setPage} />
          <p className="text-xs text-base-content/50 inline-flex items-center gap-1"><BookOpen size={12} /> Tổng {articles.length} bài</p>
        </>
      ) : (
        <HelpGuideBoard
          articles={articles}
          categories={categories}
          token={token}
          onCreate={(categoryId) => openCreate(categoryId)}
          onEdit={openEdit}
          onDelete={(a) => setConfirmDelete(a)}
          onStatus={changeStatus}
          onPreview={(a) => setPreview(a)}
        />
      )}

      {editorOpen && (
        <HelpEditor
          article={editing}
          categories={categories}
          allArticles={articles}
          presetCategoryId={editing ? null : presetCategoryId}
          onClose={() => { setEditorOpen(false); setEditing(null); setPresetCategoryId(null); }}
          onSaved={onSaved}
        />
      )}

      {preview && (
        <div className="fixed inset-0 z-[9997] bg-black/50 flex items-start justify-center overflow-y-auto p-2 sm:p-4" onClick={() => setPreview(null)}>
          <div className="bg-base-100 rounded-xl border border-base-300 w-full max-w-3xl my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-base-300">
              <div className="min-w-0">
                <h2 className="text-lg font-bold truncate">{preview.title}</h2>
                <p className="text-xs text-base-content/50">/{preview.slug} · {STATUS_LABEL[preview.status]}</p>
              </div>
              <button type="button" className="btn btn-sm btn-circle btn-ghost" onClick={() => setPreview(null)}>✕</button>
            </div>
            <div className="p-4 space-y-3">
              {preview.summary && <p className="text-sm"><span className="font-medium">Để làm gì: </span>{preview.summary}</p>}
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: preview.content_html || '' }} />
              <Gallery images={Array.isArray(preview.images) ? preview.images.map((im) => (typeof im === 'string' ? im : im.url)).filter(Boolean) : []} title={preview.title} onZoom={() => {}} />
              <VideoBlock videos={Array.isArray(preview.videos) ? preview.videos : []} token={token} />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Xóa bài hướng dẫn"
        message={confirmDelete ? `Bạn chắc chắn muốn xóa "${confirmDelete.title}"? Hành động này không hoàn tác.` : ''}
        confirmText="Xóa"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};

export default AdminHelpPage;
