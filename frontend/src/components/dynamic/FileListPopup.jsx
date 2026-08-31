import { useState } from 'react';
import FileViewer from './FileViewer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const getFileUrl = (file) => {
  if (file.url) return file.url;
  if (file.storage_key) return `${API_URL.replace('/api', '')}/uploads/${file.storage_key}`;
  return null;
};

const getFileIcon = (file) => {
  const mime = file.mime_type || file.type || '';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('excel') || mime.includes('sheet')) return '📊';
  return '📁';
};

const FileListPopup = ({ files = [], onClose, title = 'Danh sách file' }) => {
  const [viewingFile, setViewingFile] = useState(null);

  const list = Array.isArray(files) ? files : files ? [files] : [];

  if (viewingFile) {
    return (
      <FileViewer
        file={viewingFile}
        onClose={() => setViewingFile(null)}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>✕</button>
        </div>

        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>Không có file nào</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((file, idx) => {
              const url = getFileUrl(file);
              const name = file.original_name || file.name || `File ${idx + 1}`;
              return (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa'
                }}>
                  <span style={{ fontSize: 24 }}>{getFileIcon(file)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>{file.mime_type || file.type || ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {url && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setViewingFile(file)}
                      >
                        Xem
                      </button>
                    )}
                    {url && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => window.open(url, '_blank')}
                      >
                        Mở tab mới
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileListPopup;
