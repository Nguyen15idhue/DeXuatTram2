import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import FileViewer from './FileViewer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const getFileUrl = (file) => {
  if (file.url) return file.url;
  if (file.storage_key) return `${API_URL.replace('/api', '')}/uploads/${file.storage_key}`;
  return null;
};

const getDownloadUrl = (file) => {
  if (file.id) return `${API_URL}/files/${file.id}/download`;
  return getFileUrl(file);
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
  const [selected, setSelected] = useState({});
  const [downloading, setDownloading] = useState(false);

  const list = Array.isArray(files) ? files : files ? [files] : [];

  const toggleSelect = useCallback((idx) => {
    setSelected(prev => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allSelected = list.length > 0 && list.every((_, i) => selected[i]);
    const newSel = {};
    if (!allSelected) list.forEach((_, i) => { newSel[i] = true; });
    setSelected(newSel);
  }, [list, selected]);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const handleDownloadSelected = useCallback(async () => {
    const filesToDownload = list.filter((_, i) => selected[i]);
    if (filesToDownload.length === 0) return;

    setDownloading(true);
    try {
      if (filesToDownload.length === 1) {
        const file = filesToDownload[0];
        const url = getDownloadUrl(file);
        if (url) {
          const a = document.createElement('a');
          a.href = url;
          a.download = file.original_name || file.name || 'download';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        const zip = new JSZip();
        const folder = zip.folder('files');
        const fetchPromises = filesToDownload.map(async (file) => {
          const url = getDownloadUrl(file);
          if (url) {
            try {
              const response = await fetch(url);
              const blob = await response.blob();
              folder.file(file.original_name || file.name || `file_${Date.now()}`, blob);
            } catch (err) {
              console.error('Fetch file error:', err);
            }
          }
        });
        await Promise.all(fetchPromises);
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'files.zip');
      }
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  }, [list, selected]);

  const handleViewFile = useCallback((file) => {
    setViewingFile(file);
  }, []);

  const handleOpenNewTab = useCallback((file) => {
    const url = getFileUrl(file);
    if (url) {
      window.open(url, '_blank');
    }
  }, []);

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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>✕</button>
        </div>

        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>Không có file nào</div>
        ) : (
          <>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className="file-card-checkbox"
                  checked={list.length > 0 && list.every((_, i) => selected[i])}
                  onChange={toggleSelectAll}
                />
                Chọn tất cả ({list.length} file)
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
              {list.map((file, idx) => {
                const name = file.original_name || file.name || `File ${idx + 1}`;
                return (
                  <div key={idx} className="file-card">
                    <input
                      type="checkbox"
                      className="file-card-checkbox"
                      checked={!!selected[idx]}
                      onChange={() => toggleSelect(idx)}
                    />
                    <span className="file-card-icon">{getFileIcon(file)}</span>
                    <div className="file-card-info">
                      <div className="file-card-name">{name}</div>
                      <div className="file-card-meta">{file.mime_type || file.type || ''}</div>
                    </div>
                    <div className="file-card-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => handleViewFile(file)}>Xem</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => handleOpenNewTab(file)}>Tab mới</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedCount > 0 && (
              <div style={{ marginTop: 16, textAlign: 'right', paddingTop: 12, borderTop: '1px solid #e0e0e0' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleDownloadSelected}
                  disabled={downloading}
                >
                  {downloading ? 'Đang tải...' : `Tải xuống ${selectedCount} file`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FileListPopup;
