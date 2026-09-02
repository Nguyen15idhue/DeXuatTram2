import { useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import FileViewer from './FileViewer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const getViewUrl = (file) => {
  if (file.url) return file.url;
  if (file.storage_key) return `${API_URL.replace('/api', '')}/uploads/${file.storage_key}`;
  return null;
};

const getFileIcon = (file) => {
  const mime = (file.mime_type || '').toLowerCase();
  const name = (file.original_name || file.name || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name)) return '🖼️';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov)$/.test(name)) return '🎬';
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg)$/.test(name)) return '🎵';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return '📄';
  if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return '📝';
  if (mime.includes('excel') || name.endsWith('.xls') || name.endsWith('.xlsx')) return '📊';
  return '📁';
};

const FileListPopup = ({ files = [], onClose, title = 'Danh sách file' }) => {
  const { token } = useAuth();
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

  const fetchFileBlob = useCallback(async (file) => {
    const viewUrl = getViewUrl(file);
    if (!viewUrl) throw new Error('No URL');
    const response = await fetch(viewUrl, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return response.blob();
  }, [token]);

  const getOriginalFileName = useCallback((file, response) => {
    const cd = response.headers.get('content-disposition');
    if (cd) {
      const utf8Match = cd.match(/filename\*=UTF-8''([^\s;]+)/i);
      if (utf8Match) return decodeURIComponent(utf8Match[1]);
      const stdMatch = cd.match(/filename="?([^";\s]+)"?/i);
      if (stdMatch) return decodeURIComponent(stdMatch[1]);
    }
    return file.original_name || file.name || 'download';
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    const filesToDownload = list.filter((_, i) => selected[i]);
    if (filesToDownload.length === 0) return;

    setDownloading(true);
    try {
      if (filesToDownload.length === 1) {
        const file = filesToDownload[0];
        const viewUrl = getViewUrl(file);
        if (!viewUrl) return;
        const response = await fetch(viewUrl, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const blob = await response.blob();
        const fileName = getOriginalFileName(file, response);
        saveAs(blob, fileName);
      } else {
        const zip = new JSZip();
        const folder = zip.folder('files');
        await Promise.all(filesToDownload.map(async (file) => {
          try {
            const blob = await fetchFileBlob(file);
            folder.file(file.original_name || file.name || `file_${Date.now()}`, blob);
          } catch (err) {
            console.error('Fetch file error:', err);
          }
        }));
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `tonghop_${Date.now()}.zip`);
      }
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  }, [list, selected, fetchFileBlob, token, getOriginalFileName]);

  const handleViewFile = useCallback((file) => {
    setViewingFile(file);
  }, []);

  const handleOpenNewTab = useCallback(async (file) => {
    try {
      const viewUrl = getViewUrl(file);
      if (!viewUrl) return;
      const mime = (file.mime_type || '').toLowerCase();
      const name = (file.original_name || file.name || '').toLowerCase();
      const ext = name.split('.').pop();

      const isWord = mime.includes('word') || mime.includes('officedocument.wordprocessingml') || ext === 'doc' || ext === 'docx';
      const isExcel = mime.includes('sheet') || mime.includes('officedocument.spreadsheetml') || mime.includes('excel') || ext === 'xls' || ext === 'xlsx' || ext === 'csv';

      const response = await fetch(viewUrl, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

      const wrapHtml = (title, bodyContent, styles) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;color:#333}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left;white-space:nowrap}
.sheet-tab{font-weight:600;color:#fff;margin:16px 0 6px;padding:4px 10px;background:#4a6cf7;border-radius:4px;display:inline-block}
img{max-width:100%}pre{white-space:pre-wrap;word-break:break-word;background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;font-size:13px;line-height:1.5}
${styles || ''}</style></head><body>${bodyContent}</body></html>`;

      if (isWord) {
        const buf = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        const html = wrapHtml(file.original_name || 'Document', result.value);
        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      } else if (isExcel) {
        const buf = await response.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        let body = '';
        wb.SheetNames.forEach(sheetName => {
          const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
          body += `<div class="sheet-tab">${sheetName}</div>`;
          body += '<table>';
          data.forEach((row, ri) => {
            const tag = ri === 0 ? 'th' : 'td';
            body += '<tr>';
            row.forEach(cell => {
              body += `<${tag}>${cell != null ? String(cell) : ''}</${tag}>`;
            });
            body += '</tr>';
          });
          body += '</table>';
        });
        const html = wrapHtml(file.original_name || 'Spreadsheet', body);
        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      } else {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      }
    } catch (err) {
      console.error('Open new tab error:', err);
    }
  }, [token]);

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
      <div className="legacy-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
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
