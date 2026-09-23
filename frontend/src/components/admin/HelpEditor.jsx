import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Table as TableIcon,
  Link2, ImagePlus, PlayCircle as YoutubeIcon, Video, Undo2, Redo2, X, Save,
  Trash2, Upload, Eye, Code2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api, API_URL } from '../../services/api';
import { adminHelpApi } from '../../services/helpApi';
import { VideoBlock, Gallery } from '../help/HelpMedia';

const ROLE_OPTIONS = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP', 'guest'];
const KNOWN_ROUTES = ['/map', '/my-proposals', '/profile', '/de-xuat', '/admin', '/admin/users', '/admin/stations', '/admin/proposals', '/admin/audit-log', '/admin/fields', '/admin/forms', '/admin/views', '/admin/data-lists', '/admin/map-config', '/admin/roles', '/admin/api-configs', '/huong-dan'];

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`btn btn-xs ${active ? 'btn-primary' : 'btn-ghost'} px-2`}
    >
      {children}
    </button>
  );
}

const HelpEditor = ({ article, categories, allArticles, presetCategoryId, onClose, onSaved }) => {
  const { token } = useAuth();
  const isEdit = !!article?.id;
  const [form, setForm] = useState({
    title: article?.title || '',
    slug: article?.slug || '',
    slugEdited: !!article?.slug,
    category_id: article?.category_id ?? (presetCategoryId || categories[0]?.id || ''),
    summary: article?.summary || '',
    status: article?.status || 'draft',
    roles: Array.isArray(article?.roles) ? article.roles : ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP'],
    route: article?.route || '',
    tags: Array.isArray(article?.tags) ? article.tags.join(', ') : '',
    related: Array.isArray(article?.related) ? article.related : [],
    videos: Array.isArray(article?.videos) ? article.videos : [],
    images: Array.isArray(article?.images) ? article.images.map((im) => (typeof im === 'string' ? im : im.url)).filter(Boolean) : [],
  });
  const [contentJson, setContentJson] = useState(article?.content_json || null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [ytInput, setYtInput] = useState('');
  const imgInputRef = useRef(null);
  const vidInputRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      Image.configure({ inline: false }),
      Youtube.configure({ controls: true, nocookie: true }),
      Placeholder.configure({ placeholder: 'Soạn nội dung hướng dẫn. Dùng H2/H3 để chia mục...' }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
    ],
    content: article?.content_json || { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: { attributes: { class: 'prose prose-sm max-w-none focus:outline-none min-h-[280px] p-3' } },
    onUpdate: ({ editor: ed }) => setContentJson(ed.getJSON()),
  });

  useEffect(() => {
    return () => { if (editor) editor.destroy(); };
  }, [editor]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const onTitleChange = (v) => {
    setForm((f) => ({ ...f, title: v, slug: f.slugEdited ? f.slug : slugify(v) }));
  };

  const insertLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL liên kết (https:// hoặc /duong-dan)', prev);
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('originalName', file.name);
      const res = await api.uploadWithAuth('/files/upload', fd, token);
      if (!res.success) throw new Error(res.message || 'Upload ảnh lỗi');
      editor.chain().focus().setImage({ src: `${API_URL}/files/${res.data.id}/image?token=${encodeURIComponent(token)}` }).run();
    } catch (err) {
      setError(err.message || 'Upload ảnh lỗi');
    } finally {
      setUploading(false);
    }
  };

  const addYoutube = async () => {
    if (!editor || !ytInput.trim()) return;
    editor.chain().focus().setYoutubeVideo({ src: ytInput.trim() }).run();
    setForm((f) => ({ ...f, videos: [...f.videos, { type: 'youtube', url: ytInput.trim(), title: '' }] }));
    setYtInput('');
  };

  const uploadVideo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) { setError('Video vượt quá 200MB'); return; }
    setUploading(true);
    setError('');
    try {
      const res = await adminHelpApi.uploadVideo(file, token);
      if (!res.success) throw new Error(res.message || 'Upload video lỗi');
      setForm((f) => ({ ...f, videos: [...f.videos, { type: 'file', file_id: res.data.id, title: file.name.replace(/\.[^.]+$/, '') }] }));
    } catch (err) {
      setError(err.message || 'Upload video lỗi');
    } finally {
      setUploading(false);
    }
  };

  const removeVideo = (i) => setForm((f) => ({ ...f, videos: f.videos.filter((_, idx) => idx !== i) }));
  const setVideoTitle = (i, title) => setForm((f) => ({ ...f, videos: f.videos.map((v, idx) => (idx === i ? { ...v, title } : v)) }));
  const removeImage = (i) => setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));

  const toggleRole = (r) => {
    setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    slug: form.slug.trim() || slugify(form.title),
    category_id: form.category_id === '' ? null : Number(form.category_id),
    summary: form.summary.trim() || null,
    content_json: contentJson,
    videos: form.videos,
    images: form.images,
    route: form.route.trim() || null,
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    related: form.related,
    roles: form.roles.length > 0 ? form.roles : ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP'],
    status: form.status,
  });

  const save = async (statusOverride) => {
    setError('');
    if (!form.title.trim()) { setError('Tiêu đề bắt buộc'); return; }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (statusOverride) payload.status = statusOverride;
      if (!isEdit && !payload.content_json) payload.content_json = { type: 'doc', content: [{ type: 'paragraph' }] };
      const data = isEdit ? await adminHelpApi.update(article.id, payload, token) : await adminHelpApi.create(payload, token);
      if (onSaved) onSaved(data);
    } catch (err) {
      setError(err.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const previewHtml = useMemo(() => {
    if (!editor) return '';
    return editor.getHTML();
  }, [editor, contentJson, showPreview]);

  return (
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-start justify-center overflow-y-auto p-2 sm:p-4" onClick={onClose}>
      <div className="bg-base-100 rounded-xl border border-base-300 w-full max-w-6xl my-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-base-300">
          <h2 className="text-lg font-bold">{isEdit ? `Sửa: ${article.title}` : 'Thêm bài hướng dẫn'}</h2>
          <button type="button" className="btn btn-sm btn-circle btn-ghost" onClick={onClose} title="Đóng"><X size={16} /></button>
        </div>

        {error && <div className="alert alert-error py-2 px-3 m-4 mb-0"><span className="text-sm">{error}</span></div>}

        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <input className="input input-bordered w-full" placeholder="Tiêu đề bài viết" value={form.title} onChange={(e) => onTitleChange(e.target.value)} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/50 shrink-0">/{form.slug || 'slug'}</span>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => setField('slugEdited', false)} title="Tự sinh lại slug">↻</button>
              <input className="input input-bordered input-sm flex-1" placeholder="slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value, slugEdited: true }))} />
            </div>
            <textarea className="textarea textarea-bordered w-full" rows={2} placeholder="Tóm tắt (hiện ở đầu bài)" value={form.summary} onChange={(e) => setField('summary', e.target.value)} />

            <div className="border border-base-300 rounded-lg">
              <div className="flex flex-wrap gap-1 p-2 border-b border-base-300 bg-base-200">
                <ToolbarButton onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} title="Đậm"><Bold size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} title="Nghiêng"><Italic size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive('heading', { level: 2 })} title="Tiêu đề H2"><Heading2 size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={editor?.isActive('heading', { level: 3 })} title="Tiêu đề H3"><Heading3 size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')} title="Danh sách"><List size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')} title="Danh sách số"><ListOrdered size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive('blockquote')} title="Trích dẫn"><Quote size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Chèn bảng"><TableIcon size={14} /></ToolbarButton>
                <ToolbarButton onClick={insertLink} active={editor?.isActive('link')} title="Liên kết"><Link2 size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => imgInputRef.current?.click()} disabled={uploading} title="Chèn ảnh"><ImagePlus size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} title="Hoàn tác"><Undo2 size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} title="Làm lại"><Redo2 size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => setShowPreview((v) => !v)} active={showPreview} title="Xem trước"><Eye size={14} /></ToolbarButton>
              </div>
              {showPreview ? (
                <div className="prose prose-sm max-w-none p-3 min-h-[280px]" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <EditorContent editor={editor} />
              )}
            </div>
            <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
            {uploading && <p className="text-xs text-info">Đang tải file lên...</p>}
          </div>

          <div className="space-y-3">
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-3 gap-2">
                <p className="text-xs font-bold uppercase text-base-content/50">Xuất bản</p>
                <select className="select select-bordered select-sm" value={form.status} onChange={(e) => setField('status', e.target.value)}>
                  <option value="draft">Nháp</option>
                  <option value="published">Xuất bản</option>
                  <option value="archived">Lưu trữ</option>
                </select>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-sm btn-outline flex-1 gap-1" disabled={saving} onClick={() => save('draft')}><Save size={14} /> Lưu nháp</button>
                  <button type="button" className="btn btn-sm btn-primary flex-1 gap-1" disabled={saving} onClick={() => save('published')}><Upload size={14} /> Xuất bản</button>
                </div>
                {isEdit && <p className="text-xs text-base-content/50">Lượt xem: {article.view_count} · Cập nhật: {article.updated_at ? new Date(article.updated_at).toLocaleString('vi-VN') : '-'}</p>}
              </div>
            </div>

            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-3 gap-2">
                <p className="text-xs font-bold uppercase text-base-content/50">Phân loại</p>
                <select className="select select-bordered select-sm" value={form.category_id} onChange={(e) => setField('category_id', e.target.value)}>
                  <option value="">(Không chuyên mục)</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <input className="input input-bordered input-sm" placeholder="Tags (phân tách phẩy)" value={form.tags} onChange={(e) => setField('tags', e.target.value)} />
                <input className="input input-bordered input-sm" placeholder="Đường dẫn liên kết (vd /map)" list="help-routes" value={form.route} onChange={(e) => setField('route', e.target.value)} />
                <datalist id="help-routes">{KNOWN_ROUTES.map((r) => <option key={r} value={r} />)}</datalist>
              </div>
            </div>

            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-3 gap-2">
                <p className="text-xs font-bold uppercase text-base-content/50">Vai trò xem được</p>
                <div className="flex flex-wrap gap-1">
                  {ROLE_OPTIONS.map((r) => (
                    <button key={r} type="button" className={`btn btn-xs ${form.roles.includes(r) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleRole(r)}>{r}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-3 gap-2">
                <p className="text-xs font-bold uppercase text-base-content/50">Video</p>
                <div className="flex gap-2">
                  <input className="input input-bordered input-sm flex-1" placeholder="Dán link YouTube" value={ytInput} onChange={(e) => setYtInput(e.target.value)} />
                  <button type="button" className="btn btn-sm gap-1" onClick={addYoutube}><YoutubeIcon size={14} /></button>
                </div>
                <button type="button" className="btn btn-sm btn-outline gap-1" onClick={() => vidInputRef.current?.click()}>
                  <Video size={14} /> Tải video nội bộ (≤200MB)
                </button>
                <input ref={vidInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={uploadVideo} />
                {form.videos.map((v, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="badge badge-xs">{v.type}</span>
                    <input className="input input-bordered input-xs flex-1" placeholder="Tiêu đề video" value={v.title || ''} onChange={(e) => setVideoTitle(i, e.target.value)} />
                    <button type="button" className="btn btn-xs btn-ghost text-error" onClick={() => removeVideo(i)}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-3 gap-2">
                <p className="text-xs font-bold uppercase text-base-content/50">Ảnh (gallery)</p>
                {form.images.map((src, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <img src={src} alt="" className="h-8 w-12 object-cover rounded border border-base-300" />
                    <span className="text-xs truncate flex-1">{src.split('/').pop()}</span>
                    <button type="button" className="btn btn-xs btn-ghost text-error" onClick={() => removeImage(i)}><Trash2 size={12} /></button>
                  </div>
                ))}
                <button type="button" className="btn btn-sm btn-outline gap-1" onClick={() => {
                  const url = window.prompt('URL ảnh (hoặc dùng nút Chèn ảnh trong editor để upload)');
                  if (url) setField('images', [...form.images, url]);
                }}><ImagePlus size={14} /> Thêm ảnh bằng URL</button>
              </div>
            </div>

            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-3 gap-2">
                <p className="text-xs font-bold uppercase text-base-content/50">Bài liên quan</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {allArticles.filter((a) => a.id !== article?.id).map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" className="checkbox checkbox-xs" checked={form.related.includes(a.slug)} onChange={() => setField('related', form.related.includes(a.slug) ? form.related.filter((x) => x !== a.slug) : [...form.related, a.slug])} />
                      <span className="truncate">{a.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-base-300 p-4">
          <p className="text-xs font-bold uppercase text-base-content/50 mb-2"><Code2 size={12} className="inline" /> Xem trước media</p>
          <Gallery images={form.images} title={form.title} onZoom={() => {}} />
          <VideoBlock videos={form.videos} token={token} />
        </div>
      </div>
    </div>
  );
};

export default HelpEditor;
