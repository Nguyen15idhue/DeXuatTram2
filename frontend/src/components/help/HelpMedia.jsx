import { useState } from 'react';
import { Play } from 'lucide-react';
import { helpFileUrl, youtubeEmbedUrl, youtubeVideoId } from '../../services/helpApi';

export function VideoBlock({ videos, token }) {
  const [playing, setPlaying] = useState({});
  if (!videos || videos.length === 0) return null;
  return (
    <div className="space-y-2 mt-2">
      {videos.map((v, i) => {
        if (v.type === 'youtube') {
          const vid = youtubeVideoId(v.url);
          const embed = youtubeEmbedUrl(v.url);
          if (!vid || !embed) return null;
          return (
            <div key={i}>
              {v.title && <p className="text-xs font-medium mb-1">{v.title} (YouTube)</p>}
              {playing[i] ? (
                <div className="aspect-video w-full">
                  <iframe
                    src={`${embed}?autoplay=1`}
                    title={v.title || 'Video hướng dẫn'}
                    className="w-full h-full rounded-lg border border-base-300"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <button type="button" className="relative block w-full group" onClick={() => setPlaying((p) => ({ ...p, [i]: true }))} title="Phát video">
                  <img src={`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`} alt={v.title || 'Video hướng dẫn'} loading="lazy" className="w-full rounded-lg border border-base-300 max-h-80 object-contain bg-base-200" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-14 h-14 rounded-full bg-primary/90 text-primary-content flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play size={24} />
                    </span>
                  </span>
                </button>
              )}
            </div>
          );
        }
        if (v.type === 'file' && v.file_id) {
          return (
            <div key={i}>
              {v.title && <p className="text-xs font-medium mb-1">{v.title}</p>}
              <video controls preload="none" src={helpFileUrl(v.file_id, token)} className="w-full rounded-lg border border-base-300 max-h-80 bg-black" />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export function Gallery({ images, title, onZoom }) {
  if (!images || images.length === 0) return <p className="text-xs text-base-content/40 italic">Ảnh minh họa đang bổ sung.</p>;
  return (
    <div>
      <button type="button" className="block w-full" onClick={() => onZoom(0)} title="Xem lớn">
        <img src={images[0]} alt={title} loading="lazy" className="w-full rounded-lg border border-base-300 max-h-80 object-contain bg-base-200" />
      </button>
      {images.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto">
          {images.slice(1).map((src, i) => (
            <button key={i} type="button" onClick={() => onZoom(i + 1)} className="shrink-0" title="Xem lớn">
              <img src={src} alt={`${title} ${i + 2}`} loading="lazy" className="h-16 rounded border border-base-300 object-contain bg-base-200" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
