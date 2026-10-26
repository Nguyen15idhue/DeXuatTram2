import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalGradingService } from '../../services/api';
import { AlertTriangle, FileText, Paperclip, X } from 'lucide-react';
import FileViewer from '../dynamic/FileViewer';
import {
  GRADING_ROLE_LABELS,
  getGradingStatusLabel,
  getLegalDocs,
  getMissingLegalDocs,
  isLegalDocsComplete
} from '../../utils/proposalGrading';

const SCORE_OPTIONS = [0, 1, 2, 3];

const LegalDocsPanel = ({ docs, onOpenFile }) => (
  <div className="border rounded-lg p-3 bg-base-100">
    <div className="flex items-center gap-2 mb-2">
      <Paperclip size={14} />
      <h4 className="font-semibold text-sm">Hồ sơ pháp lý</h4>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      {docs.map((doc) => (
        <div
          key={doc.key}
          className={`border rounded p-2 text-sm ${doc.has_file ? '' : 'border-warning/60 bg-warning/10'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">{doc.label}</span>
            <span className={`badge badge-xs ${doc.has_file ? 'badge-success' : 'badge-warning'}`}>
              {doc.has_file ? 'Đã có' : 'Thiếu'}
            </span>
          </div>
          {doc.files.length > 0 ? (
            <div className="mt-1 flex flex-col gap-1">
              {doc.files.map((file, index) => (
                <button
                  key={`${doc.key}-${file.id ?? index}`}
                  type="button"
                  className="link link-primary text-left inline-flex items-center gap-1"
                  title={file.name || `Tệp ${index + 1}`}
                  onClick={() => onOpenFile(file)}
                >
                  <FileText size={13} className="shrink-0" />
                  <span className="truncate">{file.name || `Tệp ${index + 1}`}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-base-content/60 mt-1">Chưa có tệp đính kèm</p>
          )}
        </div>
      ))}
    </div>
  </div>
);

const DepartmentSection = ({ dept, score, note, blocked, legalWarning, onChange }) => (
  <div className="border rounded-lg p-3 space-y-2">
    <div className="flex items-center justify-between">
      <h4 className="font-semibold text-sm">{GRADING_ROLE_LABELS[dept]}</h4>
    </div>
    <select
      className="select select-bordered select-sm w-full"
      value={score}
      disabled={blocked}
      onChange={(e) => onChange(dept, 'score', e.target.value)}
    >
      <option value="">Chưa chấm</option>
      {SCORE_OPTIONS.map((option) => (
        <option key={option} value={option}>{option} điểm</option>
      ))}
    </select>
    <textarea
      className="textarea textarea-bordered text-sm w-full"
      rows={2}
      placeholder="Đánh giá của phòng (tùy chọn)"
      value={note}
      onChange={(e) => onChange(dept, 'note', e.target.value)}
    />
    {dept === 'PL' && legalWarning && (
      <div className="alert alert-warning py-2 text-sm">
        <AlertTriangle size={16} />
        <span>Chưa đủ hồ sơ pháp lý ({legalWarning}). Chỉ được chấm sau khi đã bổ sung đủ.</span>
      </div>
    )}
  </div>
);

const ProposalGradingModal = ({ open, record, canGradeQH, canGradePL, onClose, onSaved }) => {
  const { token } = useAuth();
  const [qhScore, setQhScore] = useState('');
  const [qhNote, setQhNote] = useState('');
  const [plScore, setPlScore] = useState('');
  const [plNote, setPlNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewingFile, setViewingFile] = useState(null);

  const legalDocs = useMemo(() => getLegalDocs(record), [record]);
  const legalComplete = useMemo(() => isLegalDocsComplete(record), [record]);
  const legalMissing = useMemo(() => getMissingLegalDocs(record), [record]);

  useEffect(() => {
    if (!open || !record) return;
    setQhScore(record.quy_hoach_score ?? '');
    setQhNote(record.quy_hoach_note ?? '');
    setPlScore(record.phap_ly_score ?? '');
    setPlNote(record.phap_ly_note ?? '');
    setSaving(false);
    setError('');
    setViewingFile(null);
  }, [open, record]);

  if (!open || !record) return null;

  const allowQH = canGradeQH;
  const allowPL = canGradePL;
  const plBlocked = !legalComplete && allowPL;
  const showQH = allowQH;
  const showPL = allowPL;

  const handleChange = (dept, field, value) => {
    if (dept === 'QH') {
      if (field === 'score') setQhScore(value);
      else setQhNote(value);
    } else {
      if (field === 'score') setPlScore(value);
      else setPlNote(value);
    }
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    if (saving) return;
    if (allowQH && qhScore !== '' && qhScore !== null && !SCORE_OPTIONS.map(String).includes(String(qhScore))) {
      setError('Điểm Quy hoạch phải là số nguyên từ 0 đến 3');
      return;
    }
    if (allowPL && plScore !== '' && plScore !== null && !SCORE_OPTIONS.map(String).includes(String(plScore))) {
      setError('Điểm Pháp lý phải là số nguyên từ 0 đến 3');
      return;
    }
    if (plBlocked && plScore !== '' && plScore !== null) {
      setError(`Chưa đủ hồ sơ pháp lý: ${legalMissing.join(', ')}`);
      return;
    }
    const payload = {};
    if (allowQH) {
      payload.quy_hoach_score = qhScore === '' ? null : Number(qhScore);
      payload.quy_hoach_note = qhNote || null;
    }
    if (allowPL) {
      payload.phap_ly_score = plScore === '' ? null : Number(plScore);
      payload.phap_ly_note = plNote || null;
    }
    setSaving(true);
    setError('');
    try {
      const res = await proposalGradingService.update(record.id, payload, token);
      const data = res?.data || res;
      onSaved(data, res?.message);
    } catch (err) {
      setError(err?.message || 'Không cập nhật được đánh giá');
      setSaving(false);
    }
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold text-lg">Chấm điểm Quy hoạch và Pháp lý</h3>
            <p className="text-sm text-base-content/70">
              {record.ma_de_xuat || `#${record.id}`}{record.user_name ? ` · ${record.user_name}` : ''}
            </p>
            <p className="text-xs text-base-content/60 mt-1">
              Trạng thái chi tiết: <b>{record.grading_status_label || getGradingStatusLabel(record.grading_status) || '—'}</b>
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={handleClose} title="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <LegalDocsPanel docs={legalDocs} onOpenFile={setViewingFile} />

          <div className={`grid gap-3 ${showQH && showPL ? 'sm:grid-cols-2' : ''}`}>
            {showQH && (
              <DepartmentSection
                dept="QH"
                score={qhScore}
                note={qhNote}
                onChange={(dept, field, value) => handleChange(dept, field, value)}
              />
            )}
            {showPL && (
              <DepartmentSection
                dept="PL"
                score={plScore}
                note={plNote}
                blocked={plBlocked}
                legalWarning={plBlocked ? legalMissing.join(', ') : null}
                onChange={(dept, field, value) => handleChange(dept, field, value)}
              />
            )}
          </div>
          {!showQH && !showPL && (
            <div className="alert alert-warning py-2 text-sm">
              <AlertTriangle size={16} />
              <span>Tài khoản không thuộc phòng Quy hoạch hoặc Pháp lý.</span>
            </div>
          )}
        </div>

        {error && (
          <div className="alert alert-error py-2 mt-3 text-sm">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="modal-action mt-4">
          <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={saving}>
            Hủy
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || (!showQH && !showPL)}>
            {saving ? <span className="loading loading-spinner loading-sm" /> : null}
            {saving ? 'Đang lưu...' : 'Lưu đánh giá'}
          </button>
        </div>
      </div>

      {viewingFile && (
        <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} />
      )}

      <form method="dialog" className="modal-backdrop" onClick={handleClose}>
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

export default ProposalGradingModal;
