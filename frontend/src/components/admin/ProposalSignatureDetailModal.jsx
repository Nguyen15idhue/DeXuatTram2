import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService } from '../../services/api';
import ProposalDocumentPreview from './ProposalDocumentPreview';
import { CheckCircle2, PenSquare, Send, X, XCircle } from 'lucide-react';
import {
  formatChotTotal,
  formatChotTruRows,
  formatProposedScale,
  getSignStatusColor,
  getSignStatusLabel,
  SIGN_STATUS_HINTS
} from '../../utils/proposalSignature';

const InfoRow = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-base-content/60">{label}</span>
    <span className="text-sm font-medium break-words">{value || '-'}</span>
  </div>
);

const ProposalSignatureDetailModal = ({ open, record, initialReject = false, onClose, onRejected }) => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const proposalId = record?.id;

  const loadDetail = useCallback(async () => {
    if (!proposalId) return;
    setLoading(true);
    setError('');
    try {
      const res = await proposalSignatureService.getDetail(proposalId, token);
      setDetail(res?.data || null);
    } catch (err) {
      setError(err?.message || 'Không tải được chi tiết đề xuất');
    } finally {
      setLoading(false);
    }
  }, [proposalId, token]);

  useEffect(() => {
    if (!open) return;
    setShowReject(!!initialReject);
    setReason('');
    setError('');
    loadDetail();
  }, [open, initialReject, loadDetail]);

  if (!open || !record) return null;

  const handleReject = async () => {
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError('Vui lòng nhập lý do từ chối duyệt');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await proposalSignatureService.reject(record.id, { reason: cleanReason }, token);
      onRejected && onRejected(res?.data);
    } catch (err) {
      setError(err?.message || 'Không từ chối duyệt được');
    } finally {
      setSaving(false);
    }
  };

  const goSigning = () => {
    onClose();
    navigate(`/admin/proposals/ky-bcdx/${record.id}`);
  };

  const signStatus = detail?.sign_status;
  const signColor = getSignStatusColor(signStatus);
  const previewFile = detail?.report_files?.[0] || null;

  return (
    <dialog className="modal modal-open" style={{ zIndex: 60 }}>
      <div className="modal-box max-w-4xl">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold text-lg">Chi tiết hồ sơ trình ký</h3>
            <p className="text-sm text-base-content/70">Mã đề xuất: {detail?.ma_de_xuat || record.ma_de_xuat || `#${record.id}`}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} title="Đóng" disabled={saving}>
            <X size={18} />
          </button>
        </div>

        {loading && <div className="flex justify-center py-8"><span className="loading loading-spinner" /></div>}

        {!loading && detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 border rounded p-3">
              <InfoRow label="Mã đề xuất" value={detail.ma_de_xuat} />
              <InfoRow label="Người đề xuất" value={detail.owner_name} />
              <InfoRow label="Số lượng trụ đề xuất" value={formatProposedScale(detail)} />
              <InfoRow label="Số lượng trụ chốt" value={formatChotTruRows(detail.chot_so_luong_tru)} />
              <InfoRow label="Tổng giá trị chốt" value={formatChotTotal(detail.tong_gia_tri_chot)} />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-base-content/60">Trạng thái ký</span>
                <span
                  className="badge badge-sm whitespace-nowrap w-fit"
                  style={{ backgroundColor: `${signColor}1a`, color: signColor, borderColor: signColor }}
                  title={SIGN_STATUS_HINTS[signStatus] || ''}
                >
                  {getSignStatusLabel(signStatus)}
                </span>
              </div>
            </div>

            {detail.signers?.length > 0 && (
              <div className="border rounded p-3">
                <p className="text-sm font-semibold mb-2">Người ký ({detail.signer_signed}/{detail.signer_total})</p>
                <ul className="space-y-1">
                  {detail.signers.map((signer) => (
                    <li key={signer.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {signer.full_name}
                        {signer.signer_title ? ` · ${signer.signer_title}` : ''}
                      </span>
                      <span className="badge badge-sm whitespace-nowrap">
                        {signer.status === 'SIGNED' ? 'Đã ký' : 'Chờ ký'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-sm font-semibold mb-2">Bản xem trước BCĐX</p>
              <ProposalDocumentPreview file={previewFile} height="50vh" />
            </div>

            {showReject && (
              <div className="border border-warning/50 bg-warning/10 rounded p-3 space-y-2">
                <p className="text-sm font-semibold">Lý do từ chối duyệt</p>
                <textarea
                  className="textarea textarea-bordered w-full min-h-20"
                  placeholder="Nhập lý do từ chối và nội dung cần sửa lại..."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={saving}
                />
                <div className="flex gap-2">
                  <button type="button" className="btn btn-warning btn-sm gap-1" onClick={handleReject} disabled={saving}>
                    <Send size={14} />
                    Gửi yêu cầu cập nhật lại
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowReject(false)} disabled={saving}>
                    Hủy
                  </button>
                </div>
              </div>
            )}

            {error ? <div className="alert alert-error text-sm py-2">{error}</div> : null}
          </div>
        )}

        {!loading && !detail && !error && (
          <div className="alert alert-warning text-sm">Không có dữ liệu chi tiết</div>
        )}

        <div className="modal-action">
          {detail?.can_reject && !showReject && (
            <button type="button" className="btn btn-outline btn-error gap-1" onClick={() => setShowReject(true)} disabled={saving}>
              <XCircle size={16} />
              Từ chối duyệt
            </button>
          )}
          <button type="button" className="btn btn-success gap-1" onClick={goSigning} disabled={saving || !detail}>
            <CheckCircle2 size={16} />
            Ký duyệt
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Đóng</button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={saving ? undefined : onClose}>
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

export default ProposalSignatureDetailModal;
