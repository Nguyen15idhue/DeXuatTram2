import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService } from '../../services/api';
import FileUpload from '../dynamic/FileUpload';
import { Upload, X } from 'lucide-react';
import { documentFile, ensureDocumentResponse, fileName } from '../../utils/proposalDocuments';

const FILE_ACCEPT = 'application/pdf,.pdf,.doc,.docx';

const ProposalSignedFileModal = ({ open, record, onClose, onSaved }) => {
  const { token } = useAuth();
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [documentFiles, setDocumentFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setError('');
    setSaving(false);
    setDocuments([]);
    setDocumentFiles({});
    setLoading(true);
    setLoadFailed(false);
    let cancelled = false;
    proposalSignatureService.getDetail(record.id, token).then(ensureDocumentResponse).then((response) => {
      if (!cancelled) setDocuments(response?.data?.documents || []);
    }).catch((err) => { if (!cancelled) { setError(err.message); setLoadFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, record?.id, token]);

  if (!open || !record) return null;

  const submit = async () => {
    setError('');
    if (documents.length ? documents.some((document) => !documentFiles[document.id]?.[0]?.id) : !files?.length) {
      setError('Vui lòng tải lên file BCĐX đã ký');
      return;
    }
    setSaving(true);
    try {
      const res = ensureDocumentResponse(await proposalSignatureService.uploadSignedFile(record.id, documents.length ? {
        documents: documents.map((document) => ({ document_id: document.id, file_id: documentFiles[document.id][0].id }))
      } : {
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
              Tải lên file BCĐX đã được chủ tịch phê duyệt; đề xuất sẽ chuyển sang trạng thái hoàn thành.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} title="Đóng" disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          {loading && <p>Đang tải danh sách tài liệu…</p>}
          {documents.length > 0 ? documents.map((document) => <section key={document.id} className="border rounded p-3 space-y-2">
            <p className="font-semibold text-sm">{fileName(document.source_file || documentFile(document))}</p>
            <p className="text-xs">Tải một bản đã ký hoàn chỉnh cho tài liệu này.</p>
            <FileUpload value={documentFiles[document.id] || []} onChange={(value) => setDocumentFiles((current) => ({ ...current, [document.id]: Array.isArray(value) ? value.slice(-1) : value ? [value] : [] }))}
              entityId={record.id} entityType="station_proposals" accept={FILE_ACCEPT} disabled={saving || loading} fileConfig={{ maxSize: 20 }} />
          </section>) : !loading && <FileUpload
            value={files}
            onChange={(value) => setFiles(Array.isArray(value) ? value : (value ? [value] : []))}
            entityId={record.id}
            entityType="station_proposals"
            multiple
            accept={FILE_ACCEPT}
            disabled={saving}
            fileConfig={{ maxSize: 20 }}
          />}
          {error ? <div className="alert alert-error text-sm py-2">{error}</div> : null}
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Hủy</button>
          <button type="button" className="btn btn-primary gap-1" onClick={submit} disabled={saving || loading || loadFailed || (documents.length > 0 && documents.some((document) => !documentFiles[document.id]?.[0]?.id))}>
            <Upload size={16} />
            Xác nhận upload
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={saving ? undefined : onClose}>
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

export default ProposalSignedFileModal;
