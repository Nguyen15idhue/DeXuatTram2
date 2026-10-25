import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalLayoutService } from '../../services/api';
import FileUpload from '../dynamic/FileUpload';
import FileViewer from '../dynamic/FileViewer';
import { CheckCircle2, FileText, X } from 'lucide-react';
import { getLayoutFiles } from '../../utils/proposalDesign';
import { getProposalLegalName } from '../../utils/proposalGrading';

const FILE_ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';

const toUploadValue = (row) => getLayoutFiles(row)
  .filter((file) => file.id)
  .map((file) => ({
    id: file.id,
    original_name: file.name || `File #${file.id}`,
    mime_type: file.mime_type || null
  }));

const ProposalLayoutUpdateModal = ({ open, record, onClose, onSaved }) => {
  const { token } = useAuth();
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);

  const code = record?.ma_de_xuat || (record?.id ? `#${record.id}` : '');
  const legalName = useMemo(() => (record ? getProposalLegalName(record) : ''), [record]);

  useEffect(() => {
    if (!open) return;
    setFiles(toUploadValue(record));
    setError('');
    setSaving(false);
    setViewing(null);
  }, [open, record?.id]);

  if (!open || !record) return null;

  const submit = async (approve) => {
    setError('');
    if (!files || files.length === 0) {
      setError('Vui lòng tải lên bản vẽ layout');
      return;
    }
    setSaving(true);
    try {
      const res = await proposalLayoutService.updateLayout(record.id, { files, approve }, token);
      onSaved && onSaved(res?.data, approve);
    } catch (err) {
      setError(err?.message || 'Không lưu được bản vẽ layout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog className="modal modal-open" style={{ zIndex: 60 }}>
      <div className="modal-box max-w-2xl">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold text-lg">Cập nhật bản vẽ layout</h3>
            <p className="text-sm text-base-content/70">Mã đề xuất: {code}</p>
            <p className="text-sm text-base-content/70">Pháp nhân: {legalName}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} title="Đóng" disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label py-1">
              <span className="label-text font-semibold">Bản vẽ layout</span>
            </label>
            <FileUpload
              value={files}
              onChange={(value) => setFiles(Array.isArray(value) ? value : (value ? [value] : []))}
              entityId={record.id}
              entityType="station_proposals"
              multiple
              accept={FILE_ACCEPT}
              disabled={saving}
              fileConfig={{ maxSize: 20 }}
            />
            <p className="text-xs text-base-content/60 mt-1">
              Có thể tải nhiều tệp (PDF, ảnh, Word, Excel). Tệp cũ được giữ nguyên nếu không xóa.
            </p>
          </div>

          {files.length > 0 && (
            <div className="border rounded p-2">
              <p className="text-xs font-semibold text-base-content/70 mb-1">Tệp đã có</p>
              <div className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <button
                    key={`${file.id || 'f'}-${index}`}
                    type="button"
                    className="btn btn-ghost btn-xs gap-1"
                    onClick={() => setViewing(file)}
                    title="Xem tệp"
                  >
                    <FileText size={14} />
                    {file.original_name || file.name || `File #${file.id}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error ? <div className="alert alert-error text-sm py-2">{error}</div> : null}
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Hủy</button>
          <button type="button" className="btn btn-outline btn-primary" onClick={() => submit(false)} disabled={saving}>
            Lưu nháp
          </button>
          <button type="button" className="btn btn-success gap-1" onClick={() => submit(true)} disabled={saving}>
            <CheckCircle2 size={16} />
            Duyệt
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={saving ? undefined : onClose}>
        <button type="button">close</button>
      </form>

      {viewing && (
        <FileViewer file={viewing} onClose={() => setViewing(null)} />
      )}
    </dialog>
  );
};

export default ProposalLayoutUpdateModal;
