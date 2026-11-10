import { useState } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import FileViewer from '../dynamic/FileViewer';

const ProposalDocumentPreview = ({ file, height = '60vh' }) => {
  const { token } = useAuth();
  const [fullScreenPreview, setFullScreenPreview] = useState(false);
  if (!file?.id) {
    return <div className="border rounded p-6 text-sm text-base-content/60 text-center">Chưa có file BCĐX</div>;
  }
  const fileName = file.name || file.original_name || 'Tài liệu';
  return (
    <div className="border rounded overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-base-200 border-b border-base-300">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} /><span className="text-sm truncate">{fileName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={() => setFullScreenPreview(true)}>
            <Eye size={14} />Xem toàn màn hình
          </button>
          <a className="btn btn-ghost btn-xs gap-1" target="_blank" rel="noreferrer"
            href={`${import.meta.env.VITE_API_URL || '/api'}/files/${file.id}/download?token=${encodeURIComponent(token || '')}`}>
            <Download size={14} />Tải xuống
          </a>
        </div>
      </div>
      <FileViewer file={file} inline inlineHeight={height} />
      {fullScreenPreview && <FileViewer file={file} fullScreen onClose={() => setFullScreenPreview(false)} />}
    </div>
  );
};

export default ProposalDocumentPreview;
