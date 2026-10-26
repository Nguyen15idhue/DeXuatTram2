import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import ProposalSigningDocument from '../../components/admin/ProposalSigningDocument';
import ProposalSignedFileModal from '../../components/admin/ProposalSignedFileModal';
import ProposalGradingSummary from '../../components/admin/ProposalGradingSummary';
import ProposalProgressiveDetails from '../../components/admin/ProposalProgressiveDetails';
import DynamicForm from '../../components/dynamic/DynamicForm';
import { PROPOSAL_PROCESS_FIELD_KEYS } from '../../utils/proposalProgress';
import FileViewer from '../../components/dynamic/FileViewer';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Toast from '../../components/Toast';
import {
  formatChotTotal,
  formatChotTruRows,
  formatProposedScale,
  formatSignedTime,
  getSignStatusColor,
  getSignStatusLabel,
  SIGN_STATUS
} from '../../utils/proposalSignature';
import {
  formatProposalCost,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import {
  ArrowLeft,
  CheckCircle2,
  Crosshair,
  Download,
  FileSignature,
  FileText,
  LayoutTemplate,
  Paperclip,
  PenSquare,
  RotateCcw,
  Upload
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN', { hour12: false });
};

const parseChotRows = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatCurrency = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toLocaleString('vi-VN')} ₫`;
};

const InfoItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-base-content/60">{label}</span>
    <span className="text-sm font-medium break-words">{value || '-'}</span>
  </div>
);

const AdminProposalSignDetailPage = () => {
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
  const [reworkModal, setReworkModal] = useState(false);
  const [reworkReason, setReworkReason] = useState('');
  const [reworkError, setReworkError] = useState('');
  const [reworkSaving, setReworkSaving] = useState(false);
  const [reworkConfirm, setReworkConfirm] = useState(false);
  const [signedModal, setSignedModal] = useState(false);
  const [viewing, setViewing] = useState(null);
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
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setToast({ message: err?.message || 'Không xuất được file', type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const openRework = () => {
    setReworkConfirm(false);
    setReworkModal(true);
    setReworkReason('');
    setReworkError('');
  };

  const handleRework = async () => {
    setReworkError('');
    const reason = String(reworkReason || '').trim();
    if (!reason) {
      setReworkError('Vui lòng nhập lý do yêu cầu làm lại BCĐX');
      return;
    }
    setReworkSaving(true);
    try {
      const response = await proposalSignatureService.requestRework(id, { reason }, token);
      if (response && response.success === false) {
        setReworkError(response?.message || 'Không gửi được yêu cầu làm lại BCĐX');
        return;
      }
      setReworkModal(false);
      setToast({ message: 'Đã yêu cầu làm lại BCĐX — đề xuất quay về bước lập BCĐX', type: 'success' });
      navigate('/admin/proposals/trinh-ky');
    } catch (err) {
      setReworkError(err?.message || 'Không gửi được yêu cầu làm lại BCĐX');
    } finally {
      setReworkSaving(false);
    }
  };

  const handleSignedFileUploaded = () => {
    setSignedModal(false);
    setToast({ message: 'Đã tải lên file BCĐX đã ký — đề xuất hoàn thành', type: 'success' });
    loadDetail();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={() => navigate('/admin/proposals/trinh-ky')}>
          <ArrowLeft size={16} />
          Quay lại
        </button>
        <div className="alert alert-error text-sm">{error || 'Không tìm thấy hồ sơ trình ký'}</div>
      </div>
    );
  }

  const allSigned = detail.sign_status === SIGN_STATUS.DONE || detail.sign_status === SIGN_STATUS.CEO_SIGNED;
  const showSignButton = detail.can_sign;
  const chotRows = parseChotRows(detail.chot_so_luong_tru);

  return (
    <div className="p-4 md:p-6 space-y-3 pb-20">
      <PageHeader
        title="Chi tiết trình ký"
        actions={(
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={() => navigate('/admin/proposals/trinh-ky')}>
              <ArrowLeft size={16} />
              Quay lại
            </button>
            <button type="button" className="btn btn-outline btn-sm gap-1" onClick={handleExport} disabled={exporting}>
              <Download size={16} />
              {exporting ? 'Đang tạo file…' : 'Tải file đã ký'}
            </button>
          </div>
        )}
      />

      <ProposalProgressiveDetails
        record={detail}
        progress={detail.progress}
        currentStep={6}
        onViewFile={setViewing}
        signers={detail.signers}
        showStepDetails={false}
      />

      <div className="border rounded-lg bg-base-100 p-4 grid gap-3 grid-cols-2 md:grid-cols-4">
        <InfoItem label="Người đề xuất" value={detail.owner_name} />
        <InfoItem label="Tên pháp nhân" value={getProposalLegalName(detail)} />
        <InfoItem label="SĐT liên hệ" value={getProposalPhone(detail)} />
        <InfoItem label="Mô hình đầu tư" value={detail.mo_hinh_dau_tu || '-'} />
        <InfoItem label="Địa chỉ" value={getProposalAddress(detail)} />
        <InfoItem label="Quy mô trụ đề xuất" value={formatProposedScale(detail)} />
        <InfoItem label="Số lượng trụ chốt" value={formatChotTruRows(detail.chot_so_luong_tru)} />
        <InfoItem label="Tổng giá trị chốt" value={formatChotTotal(detail.tong_gia_tri_chot)} />
        <InfoItem label="Tổng chi phí" value={formatProposalCost(detail)} />
        <InfoItem label="Ngày tạo" value={formatDate(detail.created_at)} />
        <InfoItem
          label="Trạng thái ký"
          value={
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
          }
        />
        <InfoItem label="Mức độ xem xét" value={detail.review_level ? `Mức ${detail.review_level}` : '-'} />
      </div>

      {detail.can_view && (
        <section className="border rounded-lg bg-base-100 p-4">
          <h2 className="font-semibold mb-3">Thông tin đã nhập khi tạo đề xuất</h2>
          <DynamicForm
            entity="station_proposals"
            purpose="view"
            initialData={detail.initial_proposal_data || detail}
            hideActions
            readOnlyKeys="*"
            excludeKeys={PROPOSAL_PROCESS_FIELD_KEYS}
          />
        </section>
      )}

      {chotRows.length > 0 && (
        <section className="border rounded-lg bg-base-100 p-4 space-y-2">
          <h2 className="font-semibold text-sm">Chốt số lượng trụ</h2>
          <div className="overflow-x-auto">
            <table className="table table-xs">
              <thead>
                <tr>
                  <th>Mô hình</th>
                  <th className="text-right">Số lượng</th>
                  <th>Loại trụ</th>
                  <th className="text-right">Giá chốt</th>
                  <th className="text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {chotRows.map((row, index) => {
                  const quantity = Number(row.so_luong) || 0;
                  const price = Number(row.gia_chot) || 0;
                  const amount = row.thanh_tien !== undefined && row.thanh_tien !== null
                    ? Number(row.thanh_tien)
                    : quantity * price;
                  return (
                    <tr key={`chot-${index}`}>
                      <td>{row.mo_hinh || '-'}</td>
                      <td className="text-right">{quantity}</td>
                      <td>{row.loai_tru || '-'}</td>
                      <td className="text-right">{formatCurrency(price)}</td>
                      <td className="text-right">{formatCurrency(amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4} className="text-right">Tổng giá trị chốt</th>
                  <th className="text-right">{formatChotTotal(detail.tong_gia_tri_chot)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <section className="border rounded-lg bg-base-100 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5 text-primary" />
          <div>
            <h2 className="font-semibold text-sm">Đánh giá Quy hoạch và Pháp lý</h2>
            <p className="text-xs text-base-content/60">
              Mức độ xem xét: {detail.review_level ? `Mức ${detail.review_level}` : 'Không có yêu cầu chấm lại'}
            </p>
          </div>
        </div>
        <ProposalGradingSummary record={detail} />
      </section>

      <section className="border rounded-lg bg-base-100 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <LayoutTemplate size={16} className="mt-0.5 text-primary" />
          <div>
            <h2 className="font-semibold text-sm">Bản vẽ layout</h2>
            <p className="text-xs text-base-content/60">Tệp do phòng Công nghệ và Quy hoạch đẩy lên</p>
          </div>
        </div>
        {(detail.layout_files || []).length === 0 ? (
          <p className="text-sm text-base-content/60">Chưa có bản vẽ layout.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {detail.layout_files.map((file, index) => {
              const name = file.name || `File #${file.id}`;
              const mime = String(file.mime_type || '');
              if (mime.startsWith('image/')) {
                return (
                  <button
                    key={`${file.id}-${index}`}
                    type="button"
                    className="border rounded p-1 hover:border-primary transition-colors"
                    title={name}
                    onClick={() => setViewing({ id: file.id, original_name: file.name, mime_type: file.mime_type })}
                  >
                    <img
                      src={`${API_URL}/files/${file.id}/image?token=${encodeURIComponent(token || '')}`}
                      alt={name}
                      className="h-24 object-contain rounded"
                    />
                  </button>
                );
              }
              return (
                <button
                  key={`${file.id}-${index}`}
                  type="button"
                  className="btn btn-ghost btn-xs gap-1 self-center"
                  title={name}
                  onClick={() => setViewing({ id: file.id, original_name: file.name, mime_type: file.mime_type })}
                >
                  <Paperclip size={12} />
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="border rounded-lg bg-base-100 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText size={18} />
            <h2 className="card-title text-base font-semibold">Tờ trình BCĐX và vị trí ký</h2>
          </div>
          <div className="flex items-center gap-2">
            {showSignButton && (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-xs gap-1"
                  title={`Cuộn tới ô ký của bạn ở trang ${detail.my_config?.page || 1}`}
                  onClick={() => docRef.current?.scrollToOverlay?.(Number(detail.my_config?.page) || 1)}
                >
                  <Crosshair size={13} />
                  Đến vị trí ký của tôi
                </button>
                <span className="badge badge-success badge-sm gap-1">
                  <CheckCircle2 size={12} />
                  Bạn được phân công ký
                </span>
              </>
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
      </section>

      <section className="border rounded-lg bg-base-100 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <FileSignature size={16} className="text-primary" />
          <h2 className="font-semibold text-sm">Người ký ({detail.signer_signed}/{detail.signer_total})</h2>
        </div>
        <ul className="space-y-1 text-sm">
          {(detail.signers || []).map((signer) => (
            <li key={signer.id} className="flex items-center justify-between gap-2 border-b last:border-b-0 py-1">
              <span className="truncate">
                {signer.full_name}
                {signer.signer_title ? ` · ${signer.signer_title}` : ''}
              </span>
              <span className="text-xs text-base-content/60 whitespace-nowrap">
                {signer.status === 'SIGNED' ? `Đã ký ${formatSignedTime(signer.signed_at)}` : 'Chờ ký'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap justify-center gap-2 rounded-full bg-base-100 border shadow-lg px-3 py-2">
        {showSignButton && (
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1 rounded-full"
            onClick={() => docRef.current?.scrollToOverlay?.(Number(detail.my_config?.page) || 1)}
          >
            <Crosshair size={14} />
            Đến vị trí ký của tôi
          </button>
        )}
        {detail.can_request_rework && (
          <button
            type="button"
            className="btn btn-outline btn-error btn-sm gap-1 rounded-full"
            onClick={() => setReworkConfirm(true)}
          >
            <RotateCcw size={14} />
            Yêu cầu làm lại BCĐX
          </button>
        )}
        {allSigned && (
          <>
            <button
              type="button"
              className="btn btn-success btn-sm gap-1 rounded-full"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download size={14} />
              {exporting ? 'Đang tạo file…' : 'Xuất file và trình chủ tịch'}
            </button>
            {detail.can_upload_signed && (
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1 rounded-full"
                onClick={() => setSignedModal(true)}
              >
                <Upload size={14} />
                Upload file chủ tịch đã ký
              </button>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={reworkConfirm}
        title="Yêu cầu làm lại BCĐX"
        message="Đề xuất sẽ quay về trạng thái Chờ cập nhật lại BCĐX và tạo yêu cầu cho người đề xuất cùng các cấp trên. Tiến hành?"
        cancelText="Hủy"
        confirmText="Tiếp tục"
        type="warning"
        onCancel={() => setReworkConfirm(false)}
        onConfirm={openRework}
      />

      {reworkModal && (
        <dialog className="modal modal-open" style={{ zIndex: 60 }}>
          <div className="modal-box max-w-lg">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="font-bold text-lg">Yêu cầu làm lại BCĐX</h3>
                <p className="text-sm text-base-content/70">
                  Mã đề xuất: {detail.ma_de_xuat || `#${detail.id}`}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                onClick={() => setReworkModal(false)}
                disabled={reworkSaving}
                title="Đóng"
              >
                ×
              </button>
            </div>
            <textarea
              className="textarea textarea-bordered w-full min-h-24"
              placeholder="Nhập lý do yêu cầu làm lại BCĐX (bắt buộc)"
              value={reworkReason}
              onChange={(event) => setReworkReason(event.target.value)}
              disabled={reworkSaving}
            />
            {reworkError ? <div className="alert alert-error text-sm py-2 mt-2">{reworkError}</div> : null}
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setReworkModal(false)} disabled={reworkSaving}>
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary gap-1"
                onClick={handleRework}
                disabled={reworkSaving}
              >
                {reworkSaving ? <span className="loading loading-spinner loading-sm" /> : <PenSquare size={16} />}
                Gửi yêu cầu
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop" onClick={reworkSaving ? undefined : () => setReworkModal(false)}>
            <button type="button">close</button>
          </form>
        </dialog>
      )}

      <ProposalSignedFileModal
        open={signedModal}
        record={detail}
        onClose={() => setSignedModal(false)}
        onSaved={handleSignedFileUploaded}
      />

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

      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
};

export default AdminProposalSignDetailPage;
