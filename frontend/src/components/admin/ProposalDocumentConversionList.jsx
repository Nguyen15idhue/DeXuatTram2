import { useAuth } from '../../contexts/AuthContext';
import { fileName, isUnsupportedSigningFile } from '../../utils/proposalDocuments';

const LABELS = { PENDING: 'Chưa chuyển đổi', PROCESSING: 'Đang chuyển PDF', READY: 'PDF sẵn sàng', FAILED: 'Chuyển PDF thất bại' };

export default function ProposalDocumentConversionList({ documents, onRetry, busy = false }) {
  const { token } = useAuth();
  const locked = documents.some((document) => document.has_config || document.has_signed);
  return (
    <ul className="space-y-2" aria-label="Danh sách chuyển đổi tài liệu">
      {documents.map((document) => (
        <li key={document.id} className="border rounded p-2 text-sm space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium break-all">{fileName(document.source_file || { id: document.source_file_id })}</span>
            <span className={`badge badge-sm ${document.conversion_status === 'FAILED' ? 'badge-warning' : ''}`}>{LABELS[document.conversion_status] || document.conversion_status}</span>
            {document.source_file?.id && <a className="link link-primary" href={`${import.meta.env.VITE_API_URL || '/api'}/files/${document.source_file.id}/download?token=${encodeURIComponent(token || '')}`} target="_blank" rel="noreferrer">Tải bản gốc</a>}
            {onRetry && document.conversion_status !== 'READY' && (
              <button type="button" className="btn btn-outline btn-xs" disabled={busy || locked} onClick={() => onRetry(document.id)}>Thử chuyển PDF lại</button>
            )}
          </div>
          {document.conversion_error && <p className="text-warning">{document.conversion_error}</p>}
          {locked && <p className="text-xs">Hồ sơ đã cấu hình hoặc có chữ ký: không được thay đổi bản dùng ký.</p>}
          {document.conversion_status === 'FAILED' && <p className="text-xs text-warning">Giữ nguyên bản Word. {isUnsupportedSigningFile(document.source_file) ? 'Định dạng .doc không hỗ trợ ký; hãy tải lại PDF hoặc DOCX.' : 'Nếu tiếp tục, cấu hình ký trên bản Word có thể thay đổi bố cục.'}</p>}
        </li>
      ))}
    </ul>
  );
}
