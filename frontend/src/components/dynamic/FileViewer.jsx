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
          <div className="text-center p-6 text-gray-400">Không thể hiển thị file</div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (loading) {
      return <div className="p-10 text-center text-white">Đang tải...</div>;
    }
    if (error) {
      return (
        <div className="p-10 text-center text-red-400">
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
          <video src={objectUrl} controls className="max-w-full max-h-[70vh]">Trình duyệt không hỗ trợ video.</video>
        ) : null;

      case 'audio':
        return objectUrl ? (
          <div className="p-10 text-center">
            <div className="text-5xl mb-4">🎵</div>
            <audio src={objectUrl} controls className="w-full max-w-[400px]" />
          </div>
        ) : null;

      case 'pdf':
        return objectUrl ? (
          <iframe src={objectUrl} className="w-full h-[70vh] border-none" title={name} />
        ) : null;

      case 'word':
        return (
          <div className="w-full p-5 bg-white text-black overflow-auto max-h-[70vh]">
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        );

      case 'excel':
        if (!xlsxData || xlsxData.length === 0) {
          return <div className="p-10 text-center text-gray-400">Không có dữ liệu</div>;
        }
        return (
          <div className="w-full overflow-auto max-h-[70vh] p-2.5">
            {xlsxData.map((sheet, si) => (
              <div key={si} className="mb-5">
                <div className="font-semibold text-white mb-2 px-2 py-1 bg-indigo-500 rounded inline-block">
                  {sheet.name}
                </div>
                <table className="w-full border-collapse bg-white text-[13px]">
                  <tbody>
                    {sheet.data.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} className={`border border-gray-200 px-2 py-1 ${ri === 0 ? 'bg-gray-100' : 'bg-white'}`}>
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
          <div className="w-full p-5">
            <pre style={{ margin: 0, color: '#d4d4d4', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Consolas', 'Monaco', monospace" }}>
              {textContent}
            </pre>
          </div>
        );

      default:
        if (objectUrl) {
          return (
            <div className="p-10 text-center">
              <div className="text-5xl mb-4">📁</div>
              <p className="text-gray-300">Định dạng này không hỗ trợ xem trước</p>
              <p className="text-gray-400 text-[13px]">File đã được tải. Bạn có thể kéo thả ra桌mình hoặc dùng nút tải xuống.</p>
            </div>
          );
        }
        return (
          <div className="p-10 text-center text-gray-400">
            <div className="text-5xl mb-4">📁</div>
            <p>Không thể xem trước định dạng này</p>
          </div>
        );
    }
  };

  const bgColor = fileType === 'image' || fileType === 'pdf' ? '#525659' : '#1e1e1e';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="legacy-modal max-w-[950px] max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="m-0 text-base overflow-hidden text-ellipsis whitespace-nowrap flex-1">{name}</h3>
          <div className="flex gap-1.5 items-center">
            {fileType === 'image' && (
              <>
                <button className="btn btn-sm btn-secondary" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>−</button>
                <span className="text-xs text-gray-500 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
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
