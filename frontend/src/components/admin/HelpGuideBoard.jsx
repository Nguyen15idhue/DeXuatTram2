import { useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, Eye, Upload, Archive, FileText, Eye as EyeIcon,
} from 'lucide-react';
import { VideoBlock, Gallery } from '../help/HelpMedia';

const STATUS_LABEL = { draft: 'Nháp', published: 'Đã xuất bản', archived: 'Lưu trữ' };
const STATUS_VARIANT = { draft: 'badge-warning', published: 'badge-success', archived: 'badge-neutral' };

function ArticleCard({ article, index, token, onEdit, onDelete, onStatus, onPreview }) {
  const images = Array.isArray(article.images)
    ? article.images.map((im) => (typeof im === 'string' ? im : im.url)).filter(Boolean)
    : [];
  const videos = Array.isArray(article.videos) ? article.videos : [];
  const isNew = article.published_at ? (Date.now() - new Date(article.published_at).getTime()) < 7 * 864e5 : false;

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-4 gap-3">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-content text-sm font-bold flex items-center justify-center">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base">{article.title}</h3>
              <span className="badge badge-outline badge-xs">{article.legacy_id || article.slug}</span>
              <span className={`badge badge-xs ${STATUS_VARIANT[article.status] || 'badge-neutral'}`}>{STATUS_LABEL[article.status] || article.status}</span>
              {isNew && <span className="badge badge-success badge-xs">Mới</span>}
            </div>
            {article.summary && <p className="text-sm mt-1"><span className="font-medium">Để làm gì: </span>{article.summary}</p>}
            {article.content_html && <div className="prose prose-sm max-w-none mt-1" dangerouslySetInnerHTML={{ __html: article.content_html }} />}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-base-content/50">/{article.slug}</span>
              <span className="inline-flex items-center gap-1 text-xs text-base-content/50"><EyeIcon size={12} /> {article.view_count}</span>
              <span className="text-xs text-base-content/40">{article.updated_at ? new Date(article.updated_at).toLocaleDateString('vi-VN') : ''}</span>
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" className="btn btn-xs btn-ghost" title="Xem trước" onClick={() => onPreview(article)}><Eye size={13} /></button>
                <button type="button" className="btn btn-xs btn-outline gap-1" onClick={() => onEdit(article)}><Pencil size={13} /> Sửa</button>
                {article.status !== 'published'
                  ? <button type="button" className="btn btn-xs btn-success gap-1" onClick={() => onStatus(article, 'publish')}><Upload size={13} /> Xuất bản</button>
                  : <button type="button" className="btn btn-xs btn-warning gap-1" onClick={() => onStatus(article, 'archive')}><Archive size={13} /> Lưu trữ</button>}
                <button type="button" className="btn btn-xs btn-ghost text-error" title="Xóa" onClick={() => onDelete(article)}><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        </div>
        <Gallery images={images} title={article.title} onZoom={() => onPreview(article)} />
        <VideoBlock videos={videos} token={token} />
      </div>
    </div>
  );
}

const HelpGuideBoard = ({ articles, categories, token, onEdit, onCreate, onDelete, onStatus, onPreview }) => {
  const [selected, setSelected] = useState('');

  const groups = useMemo(() => {
    const byCat = new Map();
    for (const c of categories) byCat.set(c.id, { id: String(c.id), slug: c.slug, title: c.title, steps: [] });
    const uncategorized = { id: 'none', slug: 'none', title: 'Chưa phân loại', steps: [] };
    for (const a of articles) {
      const g = byCat.get(a.category_id);
      if (g) g.steps.push(a);
      else uncategorized.steps.push(a);
    }
    const list = [...byCat.values()].filter((g) => g.steps.length > 0);
    if (uncategorized.steps.length > 0) list.push(uncategorized);
    return list;
  }, [articles, categories]);

  const activeId = selected && groups.some((g) => g.id === selected) ? selected : groups[0]?.id || '';
  const active = groups.find((g) => g.id === activeId);

  return (
    <div className="flex gap-6 items-start">
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="card bg-base-100 border border-base-300 sticky top-2">
          <div className="card-body p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="text-xs font-bold uppercase text-base-content/50 px-2">Mục lục</p>
              <button type="button" className="btn btn-xs btn-primary gap-1" onClick={() => onCreate(active ? Number(active.id) : null)} title="Thêm bài mới"><Plus size={12} /></button>
            </div>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelected(g.id)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-left ${g.id === activeId ? 'bg-primary text-primary-content font-medium' : 'hover:bg-base-200'}`}
              >
                <FileText size={15} />
                <span className="truncate">{g.title}</span>
                <span className="badge badge-xs ml-auto">{g.steps.length}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 space-y-3">
        <div className="lg:hidden">
          <select className="select select-bordered select-sm w-full" value={activeId} onChange={(e) => setSelected(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.title} ({g.steps.length})</option>)}
          </select>
        </div>

        {active ? (
          <>
            <h2 className="flex items-center gap-2 text-lg font-bold text-primary border-b border-base-300 pb-1">
              <FileText size={18} />
              {active.title}
              <span className="badge badge-sm">{active.steps.length} bài</span>
              <button type="button" className="btn btn-xs btn-primary gap-1 ml-auto" onClick={() => onCreate(Number(active.id))}>
                <Plus size={12} /> Thêm bài vào mục này
              </button>
            </h2>
            {active.steps.map((a, idx) => (
              <ArticleCard
                key={a.id}
                article={a}
                index={idx}
                token={token}
                onEdit={onEdit}
                onDelete={onDelete}
                onStatus={onStatus}
                onPreview={onPreview}
              />
            ))}
          </>
        ) : (
          <p className="text-sm text-base-content/60">Chưa có bài hướng dẫn nào.</p>
        )}
      </div>
    </div>
  );
};

export default HelpGuideBoard;
