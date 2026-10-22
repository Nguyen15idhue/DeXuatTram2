import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import mammoth from 'mammoth';
import { Download, FileText } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const detectType = (file) => {
  const mime = String(file?.mime_type || '').toLowerCase();
  const name = String(file?.name || file?.original_name || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('word') || mime.includes('officedocument.wordprocessingml') || name.endsWith('.doc') || name.endsWith('.docx')) return 'word';
  if (mime.startsWith('image/')) return 'image';
  return 'file';
};

const ProposalDocumentPreview = ({ file, height = '60vh' }) => {
  const { token } = useAuth();
  const [objectUrl, setObjectUrl] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const objectUrlRef = useRef(null);

  const fileId = file?.id;
  const fileName = file?.name || file?.original_name || 'Tài liệu';
  const fileType = detectType(file);

  useEffect(() => {
    if (!fileId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setHtml('');

    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const url = `${API_URL}/files/${fileId}/download?token=${encodeURIComponent(token || '')}`;

    if (fileType === 'pdf' || fileType === 'image') {
      setObjectUrl(url);
      setLoading(false);
      return () => { cancelled = true; };
    }

    if (fileType === 'word') {
      fetch(url, { headers })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (!cancelled) setHtml(result.value);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || 'Không đọc được file Word');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => { cancelled = true; };
    }

    setLoading(false);
    return () => { cancelled = true; };
  }, [fileId, fileType, token]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  if (!fileId) {
    return (
      <div className="border rounded p-6 text-sm text-base-content/60 text-center">
        Chưa có file BCĐX
      </div>
    );
  }

  return (
    <div className="border rounded overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-base-200 border-b border-base-300">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} />
          <span className="text-sm truncate">{fileName}</span>
        </div>
        <a
          className="btn btn-ghost btn-xs gap-1"
          href={`${API_URL}/files/${fileId}/download?token=${encodeURIComponent(token || '')}`}
          target="_blank"
          rel="noreferrer"
        >
          <Download size={14} />
          Tải xuống
        </a>
      </div>
      <div style={{ height }}>
        {loading && <div className="flex justify-center py-8"><span className="loading loading-spinner" /></div>}
        {!loading && error && <div className="p-6 text-sm text-error">{error}</div>}
        {!loading && !error && fileType === 'pdf' && (
          <iframe src={objectUrl} className="w-full h-full border-none" title={fileName} />
        )}
        {!loading && !error && fileType === 'image' && (
          <img src={objectUrl} alt={fileName} className="w-full h-full object-contain" />
        )}
        {!loading && !error && fileType === 'word' && (
          <div className="p-4 overflow-auto h-full bg-white" dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {!loading && !error && fileType === 'file' && (
          <div className="p-6 text-sm text-base-content/60">
            Không xem trước được định dạng này, vui lòng tải xuống để xem.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProposalDocumentPreview;
