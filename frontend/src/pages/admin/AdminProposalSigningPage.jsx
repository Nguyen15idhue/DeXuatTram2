import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import ProposalDocumentPreview from '../../components/admin/ProposalDocumentPreview';
import Toast from '../../components/Toast';
import {
  formatChotTotal,
  formatChotTruRows,
  formatProposedScale,
  formatSignedTime,
  getSignStatusColor,
  getSignStatusLabel
} from '../../utils/proposalSignature';
import { ArrowLeft, CheckCircle2, Download, Eye, PenSquare, Printer, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const SignatureSheet = ({ detail, token, onSign, signing, printMode = false }) => {
  const signers = detail?.signers || [];
  return (
    <div
      className="relative w-full bg-white border rounded shadow-sm"
      style={{ aspectRatio: '210 / 297' }}
    >
      {signers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-base-content/50">
          Chưa có cấu hình ô ký cho đề xuất này
        </div>
      )}
      {signers.map((signer) => {
        const isSigned = signer.status === 'SIGNED';
        const isMine = Number(signer.user_id) === Number(detail?.my_config?.user_id);
        const canSignHere = isMine && signer.status === 'PENDING' && !printMode;
        return (
          <div
            key={signer.id}
            className={`absolute border-2 ${isSigned ? 'border-success' : 'border-dashed border-primary'}`}
            style={{
              left: `${signer.pos_x * 100}%`,
              top: `${signer.pos_y * 100}%`,
              width: `${signer.box_width * 100}%`,
              height: `${signer.box_height * 100}%`,
              minHeight: '54px'
            }}
          >
            {isSigned && (
              <img
                src={`${API_URL}/admin/proposal-signatures/${detail.id}/signature-image/${signer.id}?token=${encodeURIComponent(token || '')}`}
                alt={signer.full_name}
                className="max-h-full max-w-full object-contain"
              />
            )}
            <div className="absolute -top-6 left-0 right-0 flex items-center justify-between gap-1 text-[10px]">
              <span className="truncate bg-base-200 px-1 rounded">
                {signer.full_name}{signer.signer_title ? ` · ${signer.signer_title}` : ''}
              </span>
              {canSignHere && (
                <button
                  type="button"
                  className="btn btn-xs btn-success gap-1"
                  onClick={() => onSign(signer)}
                  disabled={signing}
                >
                  <PenSquare size={12} />
                  Ký ngay
                </button>
              )}
            </div>
            <div className="absolute -bottom-5 left-0 right-0 text-[10px] text-base-content/60 truncate">
              {isSigned
                ? `Đã ký ${formatSignedTime(signer.signed_at)}`
                : 'Chờ ký'}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const AdminProposalSigningPage = () => {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [printOpen, setPrintOpen] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await proposalSignatureService.getDetail(id, token);
      setDetail(res?.data || null);
    } catch (err) {
      setError(err?.message || 'Không tải được hồ sơ trình ký');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleSign = async (signer) => {
    setSigning(true);
    setToast({ message: '', type: 'success' });
    try {
      await proposalSignatureService.sign(id, token);
      setToast({ message: 'Đã ký BCĐX', type: 'success' });
      await loadDetail();
    } catch (err) {
      setToast({ message: err?.message || 'Không ký được', type: 'error' });
    } finally {
      setSigning(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await proposalSignatureService.getExportFile(id, token);
      const file = res?.data;
      if (!file?.file_id) {
        setToast({ message: 'Đề xuất chưa có file để xuất', type: 'warning' });
        return;
      }
      window.open(`${API_URL}/files/${file.file_id}/download?token=${encodeURIComponent(token || '')}`, '_blank');
    } catch (err) {
      setToast({ message: err?.message || 'Không xuất được file', type: 'error' });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-3">
      <PageHeader
        title="Ký BCĐX"
        subtitle={`Mã đề xuất: ${detail?.ma_de_xuat || `#${id}`}`}
        actions={(
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={() => navigate('/admin/proposals/trinh-ky')}>
              <ArrowLeft size={16} />
              Quay lại
            </button>
            <button type="button" className="btn btn-outline btn-sm gap-1" onClick={handleExport}>
              <Download size={16} />
              Xuất file PDF
            </button>
            <button type="button" className="btn btn-primary btn-sm gap-1" onClick={() => setPrintOpen(true)}>
              <Printer size={16} />
              In bản đã ký
            </button>
          </div>
        )}
      />

      {loading && <div className="flex justify-center py-8"><span className="loading loading-spinner" /></div>}

      {!loading && error && <div className="alert alert-error text-sm">{error}</div>}

      {!loading && detail && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="card bg-base-100 shadow-sm">
              <div className="card-body space-y-3">
                <h3 className="card-title text-base">Thông tin hồ sơ</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-base-content/60">Mã đề xuất</p>
                    <p className="font-medium">{detail.ma_de_xuat}</p>
                  </div>
                  <div>
                    <p className="text-xs text-base-content/60">Người đề xuất</p>
                    <p className="font-medium">{detail.owner_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-base-content/60">Số lượng trụ đề xuất</p>
                    <p className="font-medium">{formatProposedScale(detail)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-base-content/60">Số lượng trụ chốt</p>
                    <p className="font-medium">{formatChotTruRows(detail.chot_so_luong_tru)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-base-content/60">Tổng giá trị chốt</p>
                    <p className="font-medium">{formatChotTotal(detail.tong_gia_tri_chot)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-base-content/60">Trạng thái ký</p>
                    <span
                      className="badge badge-sm"
                      style={{
                        backgroundColor: `${getSignStatusColor(detail.sign_status)}1a`,
                        color: getSignStatusColor(detail.sign_status),
                        borderColor: getSignStatusColor(detail.sign_status)
                      }}
                    >
                      {getSignStatusLabel(detail.sign_status)}
                    </span>
                  </div>
                </div>

                <div className="border rounded p-2">
                  <p className="text-xs font-semibold text-base-content/70 mb-1">
                    Người ký ({detail.signer_signed}/{detail.signer_total})
                  </p>
                  <ul className="space-y-1 text-sm">
                    {detail.signers.map((signer) => (
                      <li key={signer.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {signer.full_name}
                          {signer.signer_title ? ` · ${signer.signer_title}` : ''}
                        </span>
                        <span className="text-xs text-base-content/60 whitespace-nowrap">
                          {signer.status === 'SIGNED'
                            ? `Đã ký ${formatSignedTime(signer.signed_at)}`
                            : 'Chờ ký'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h3 className="card-title text-base gap-2">
                  <Eye size={16} />
                  Bản xem trước BCĐX
                </h3>
                <ProposalDocumentPreview file={detail.report_files?.[0] || null} height="50vh" />
              </div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-sm">
            <div className="card-body space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="card-title text-base">Vị trí ký</h3>
                {detail.can_sign && (
                  <span className="badge badge-success badge-sm gap-1">
                    <CheckCircle2 size={12} />
                    Bạn được phân công ký
                  </span>
                )}
              </div>
              <p className="text-xs text-base-content/60">
                Nhấn "Ký ngay" tại ô ký của bạn để đóng dấu chữ ký số đã tải trong hồ sơ cá nhân.
              </p>
              <SignatureSheet detail={detail} token={token} onSign={handleSign} signing={signing} />
            </div>
          </div>
        </div>
      )}

      {printOpen && detail && (
        <dialog className="modal modal-open" style={{ zIndex: 60 }}>
          <div className="modal-box max-w-3xl">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-bold text-lg">Bản đã ký — {detail.ma_de_xuat}</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setPrintOpen(false)} title="Đóng">
                <X size={18} />
              </button>
            </div>
            <SignatureSheet detail={detail} token={token} onSign={handleSign} signing={signing} printMode />
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setPrintOpen(false)}>Đóng</button>
              <button type="button" className="btn btn-primary gap-1" onClick={() => window.print()}>
                <Printer size={16} />
                In / Lưu PDF
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop" onClick={() => setPrintOpen(false)}>
            <button type="button">close</button>
          </form>
        </dialog>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
};

export default AdminProposalSigningPage;
