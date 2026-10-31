import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import ProposalSigningDocument from '../../components/admin/ProposalSigningDocument';
import ProposalLocationMapButton from '../../components/admin/ProposalLocationMapButton';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Toast from '../../components/Toast';
import {
  formatChotTotal,
  formatChotTruRows,
  formatProposedScale,
  formatSignedTime,
  getSignStatusColor,
  getSignStatusLabel
} from '../../utils/proposalSignature';
import { ArrowLeft, CheckCircle2, Crosshair, Download } from 'lucide-react';

const AdminProposalSigningPage = () => {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const docRef = useRef(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [noSignature, setNoSignature] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

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

  const handleSign = async () => {
    setSigning(true);
    setToast({ message: '', type: 'success' });
    try {
      const response = await proposalSignatureService.sign(id, token);
      if (response && response.success === false) {
        if (String(response?.message || '').includes('chưa tải chữ ký số')) {
          setNoSignature(true);
        } else {
          setToast({ message: response?.message || 'Không ký được', type: 'error' });
        }
        return;
      }
      setToast({ message: 'Đã ký BCĐX', type: 'success' });
      await loadDetail();
    } catch (err) {
      const message = err?.message || 'Không ký được';
      if (String(message).includes('chưa tải chữ ký số')) {
        setNoSignature(true);
      } else {
        setToast({ message, type: 'error' });
      }
    } finally {
      setSigning(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await proposalSignatureService.downloadSignedDocument(id, token);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (err) {
      setToast({ message: err?.message || 'Không xuất được file', type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-3">
      <PageHeader
        title="Ký BCĐX"
        actions={(
          <div className="flex gap-2">
            <ProposalLocationMapButton proposal={detail} />
            <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={() => navigate('/admin/proposals/trinh-ky')}>
              <ArrowLeft size={16} />
              Quay lại
            </button>
            <button type="button" className="btn btn-outline btn-sm gap-1" onClick={handleExport} disabled={exporting || loading || !detail}>
              <Download size={16} />
              {exporting ? 'Đang tạo file…' : (detail?.signer_signed > 0 ? 'Tải file đã ký' : 'Tải tài liệu')}
            </button>
          </div>
        )}
      />

      {loading && <div className="flex justify-center py-8"><span className="loading loading-spinner" /></div>}

      {!loading && error && <div className="alert alert-error text-sm">{error}</div>}

      {!loading && detail && (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
          <div className="space-y-3">
            <div className="card bg-base-100 shadow-sm">
              <div className="card-body space-y-3">
                <h3 className="card-title text-base">Thông tin hồ sơ</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-base-content/60">Mã đề xuất</p>
                    <p className="font-medium">{detail.ma_de_xuat || `#${detail.id}`}</p>
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

          </div>

          <div className="card bg-base-100 shadow-sm">
            <div className="card-body space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="card-title text-base">Tài liệu BCĐX và vị trí ký</h3>
                <div className="flex items-center gap-2">
                  {detail.can_sign && detail.my_config && (
                    <button
                      type="button"
                      className="btn btn-outline btn-xs gap-1"
                      title={`Cuộn tới ô ký của bạn ở trang ${detail.my_config.page || 1}`}
                      onClick={() =>
                        docRef.current?.scrollToOverlay?.(
                          Number(detail.my_config?.page) || 1,
                        )
                      }
                    >
                      <Crosshair size={13} />
                      Đến vị trí ký của tôi
                    </button>
                  )}
                  {detail.can_sign && (
                    <span className="badge badge-success badge-sm gap-1">
                      <CheckCircle2 size={12} />
                      Bạn được phân công ký
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-base-content/60">
                Nhấn "Ký ngay" tại ô ký của bạn để đóng dấu chữ ký số đã tải trong hồ sơ cá nhân.
              </p>
              <ProposalSigningDocument
                ref={docRef}
                file={detail.report_files?.[0] || null}
                proposalId={detail.id}
                myConfig={detail.my_config}
                signers={detail.signers}
                canSign={detail.can_sign}
                onSign={handleSign}
                signing={signing}
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={noSignature}
        title="Bạn chưa có chữ ký số"
        message="Vui lòng tải lên ảnh chữ ký số trong phần Quản lý chữ ký số, sau đó quay lại đây để ký BCĐX."
        cancelText="Để sau"
        confirmText="Cấu hình ngay"
        type="warning"
        onCancel={() => setNoSignature(false)}
        onConfirm={() => {
          setNoSignature(false);
          navigate('/admin/e-sign');
        }}
      />
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
};

export default AdminProposalSigningPage;
