import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService } from '../../services/api';
import FileUpload from '../dynamic/FileUpload';
import FileViewer from '../dynamic/FileViewer';
import { Upload, X } from 'lucide-react';
import { ensureDocumentResponse } from '../../utils/proposalDocuments';

const FILE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.pdf';
const validateFile = file => /\.(jpe?g|png|gif|webp|docx?|pdf)$/i.test(file.name);

const ProposalSignedFileModal = ({ open, record, onClose, onSaved }) => {
  const { token } = useAuth();
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setError('');
    setSaving(false);
    setUploading(false);
    setUploadError('');
    setViewing(null);
    setLoading(true);
    setLoadFailed(false);
    let cancelled = false;
    proposalSignatureService.getDetail(record.id, token).then(ensureDocumentResponse).then((response) => {
      if (!cancelled && !response?.data?.can_upload_signed) {
        setError('Hồ sơ không còn cho phép upload file chủ tịch');
        setLoadFailed(true);
      }
    }).catch((err) => { if (!cancelled) { setError(err.message); setLoadFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, record?.id, token]);

  if (!open || !record) return null;

  const submit = async () => {
    if (saving || uploading || uploadError || loading || loadFailed) return;
    setError('');
    if (!files?.length || files.length > 20) {
      setError('Vui lòng tải lên file BCĐX đã ký');
      return;
    }
    setSaving(true);
    try {
      const res = ensureDocumentResponse(await proposalSignatureService.uploadSignedFile(record.id, {
        files: files.map((file) => ({ id: file.id }))
      }, token));
      onSaved && onSaved(res?.data);
    } catch (err) {
      setError(err?.message || 'Không tải lên được file đã ký');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog className="modal modal-open" style={{ zIndex: 60 }}>
      <div className="modal-box max-w-2xl">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold text-lg">Upload file BCĐX đã ký</h3>
            <p className="text-sm text-base-content/70">
              Mã đề xuất: {record.ma_de_xuat || `#${record.id}`}
            </p>
            <p className="text-xs text-base-content/60">
              Danh sách chung cho cả đề xuất: ảnh JPG/PNG/GIF/WEBP, Word DOC/DOCX và PDF.
              Tối đa 20 file, 10MB/file. Giữ nguyên file gốc, không chuyển PDF.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} title="Đóng" disabled={saving || uploading}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          {loading && <p>Đang kiểm tra quyền upload…</p>}
          {!loading && !loadFailed && <FileUpload
            value={files}
            onChange={(value) => setFiles(Array.isArray(value) ? value : (value ? [value] : []))}
            entityId={record.id}
            entityType="station_proposals"
            multiple
            accept={FILE_ACCEPT}
            disabled={saving}
            validateFile={validateFile}
            onUploadingChange={setUploading}
            onUploadError={setUploadError}
            onPreviewFile={setViewing}
            retryFailedUploads
            fileConfig={{ maxSize: 10, maxFiles: 20 }}
          />}
          <p className="text-xs text-base-content/60">Đã chọn {files.length}/20 file. Tải nguyên bản hoặc ZIP sau khi xác nhận.</p>
          {error ? <div className="alert alert-error text-sm py-2">{error}</div> : null}
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving || uploading}>Hủy</button>
          <button type="button" className="btn btn-primary gap-1" onClick={submit} disabled={saving || uploading || !!uploadError || loading || loadFailed || !files.length}>
            <Upload size={16} />
            Xác nhận upload
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={saving || uploading ? undefined : onClose}>
        <button type="button">close</button>
      </form>
      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} fullScreen />}
    </dialog>
  );
};

export default ProposalSignedFileModal;
