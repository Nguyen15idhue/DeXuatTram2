import { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const getViewUrl = (file) => {
  if (file.url) return file.url;
  if (file.storage_key) return `${API_URL.replace('/api', '')}/uploads/${file.storage_key}`;
  return null;
};

const detectType = (file) => {
  const mime = (file.mime_type || '').toLowerCase();
  const name = (file.original_name || file.name || '').toLowerCase();
  const ext = name.split('.').pop();

  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4','webm','mov','avi','mkv'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3','wav','m4a','ogg','flac','aac'].includes(ext)) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.includes('word') || mime.includes('officedocument.wordprocessingml') || ['doc','docx'].includes(ext)) return 'word';
  if (mime.includes('sheet') || mime.includes('officedocument.spreadsheetml') || mime.includes('excel') || ['xls','xlsx'].includes(ext)) return 'excel';
  if (mime.startsWith('text/') || ['txt','csv','json','xml','md','log','css','js','html','htm'].includes(ext)) return 'text';
  return 'unknown';
};

const FileViewer = ({ file, onClose }) => {
  const { token } = useAuth();
  const [zoom, setZoom] = useState(1);
  const [objectUrl, setObjectUrl] = useState(null);
  const [htmlContent, setHtmlContent] = useState('');
  const [textContent, setTextContent] = useState('');
  const [xlsxData, setXlsxData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const url = getViewUrl(file);
  const fileType = detectType(file);
  const name = file.original_name || file.name || 'File';
  const objectUrlRef = useRef(null);

  useEffect(() => {
    if (!url) return;
    setLoading(true);
    setError('');
    setHtmlContent('');
    setTextContent('');
    setXlsxData(null);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);

    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    if (fileType === 'word') {
      fetch(url, { headers })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then(buf => mammoth.convertToHtml({ arrayBuffer: buf }))
        .then(result => {
          setHtmlContent(result.value);
        })
        .catch(err => setError('Lỗi đọc file Word: ' + err.message))
        .finally(() => setLoading(false));
    } else if (fileType === 'excel') {
      fetch(url, { headers })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then(buf => {
          const wb = XLSX.read(buf, { type: 'array' });
          const sheets = wb.SheetNames.map(name => ({
            name,
            data: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 })
          }));
          setXlsxData(sheets);
        })
        .catch(err => setError('Lỗi đọc file Excel: ' + err.message))
        .finally(() => setLoading(false));
    } else if (fileType === 'text') {
      fetch(url, { headers })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
        .then(t => setTextContent(t))
        .catch(() => setError('Không thể đọc nội dung file'))
        .finally(() => setLoading(false));
    } else {
      fetch(url, { headers })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
        .then(blob => {
          const objUrl = URL.createObjectURL(blob);
          objectUrlRef.current = objUrl;
          setObjectUrl(objUrl);
        })
        .catch(err => setError('Không thể tải file: ' + err.message))
        .finally(() => setLoading(false));
    }

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [url, fileType, token]);

  if (!url) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="legacy-modal" onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>Không thể hiển thị file</div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (loading) {
      return <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>Đang tải...</div>;
    }
    if (error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>
          <p>{error}</p>
        </div>
      );
    }

    switch (fileType) {
      case 'image':
        return objectUrl ? (
          <img
            src={objectUrl}
            alt={name}
            style={{ maxWidth: '100%', maxHeight: '70vh', transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.2s' }}
          />
        ) : null;

      case 'video':
        return objectUrl ? (
          <video src={objectUrl} controls style={{ maxWidth: '100%', maxHeight: '70vh' }}>Trình duyệt không hỗ trợ video.</video>
        ) : null;

      case 'audio':
        return objectUrl ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
            <audio src={objectUrl} controls style={{ width: '100%', maxWidth: 400 }} />
          </div>
        ) : null;

      case 'pdf':
        return objectUrl ? (
          <iframe src={objectUrl} style={{ width: '100%', height: '70vh', border: 'none' }} title={name} />
        ) : null;

      case 'word':
        return (
          <div style={{ width: '100%', padding: 20, background: '#fff', color: '#000', overflow: 'auto', maxHeight: '70vh' }}>
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        );

      case 'excel':
        if (!xlsxData || xlsxData.length === 0) {
          return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Không có dữ liệu</div>;
        }
        return (
          <div style={{ width: '100%', overflow: 'auto', maxHeight: '70vh', padding: 10 }}>
            {xlsxData.map((sheet, si) => (
              <div key={si} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, color: '#fff', marginBottom: 8, padding: '4px 8px', background: '#4a6cf7', borderRadius: 4, display: 'inline-block' }}>
                  {sheet.name}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: 13 }}>
                  <tbody>
                    {sheet.data.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ border: '1px solid #e0e0e0', padding: '4px 8px', background: ri === 0 ? '#f0f2f5' : '#fff' }}>
                            {cell != null ? String(cell) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        );

      case 'text':
        return (
          <div style={{ width: '100%', padding: 20, boxSizing: 'border-box' }}>
            <pre style={{ margin: 0, color: '#d4d4d4', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Consolas', 'Monaco', monospace" }}>
              {textContent}
            </pre>
          </div>
        );

      default:
        if (objectUrl) {
          return (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
              <p style={{ color: '#ccc' }}>Định dạng này không hỗ trợ xem trước</p>
              <p style={{ color: '#888', fontSize: 13 }}>File đã được tải. Bạn có thể kéo thả ra桌mình hoặc dùng nút tải xuống.</p>
            </div>
          );
        }
        return (
          <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
            <p>Không thể xem trước định dạng này</p>
          </div>
        );
    }
  };

  const bgColor = fileType === 'image' || fileType === 'pdf' ? '#525659' : '#1e1e1e';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="legacy-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 950, maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {fileType === 'image' && (
              <>
                <button className="btn btn-sm btn-secondary" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>−</button>
                <span style={{ fontSize: 12, color: '#666', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <button className="btn btn-sm btn-secondary" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
              </>
            )}
            <button className="btn btn-sm btn-secondary" onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 'calc(92vh - 80px)', background: bgColor, borderRadius: 8, display: 'flex', alignItems: (fileType === 'pdf' || fileType === 'word' || fileType === 'excel') ? 'flex-start' : 'center', justifyContent: 'center', flexDirection: (fileType === 'pdf' || fileType === 'word' || fileType === 'excel') ? 'column' : 'row', minHeight: 200 }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default FileViewer;
