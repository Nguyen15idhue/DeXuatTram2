import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { adminProposalService, proposalSignatureService } from '../../services/api';
import useFieldOptions from '../../hooks/useFieldOptions';
import DynamicForm from '../../components/dynamic/DynamicForm';
import FileViewer from '../../components/dynamic/FileViewer';
import ProposalGradingSummary from '../../components/admin/ProposalGradingSummary';
import ProposalProgressiveDetails from '../../components/admin/ProposalProgressiveDetails';
import ProposalLocationMapButton from '../../components/admin/ProposalLocationMapButton';
import ExtendDeadlineDialog from '../../components/admin/ExtendDeadlineDialog';
import Toast from '../../components/Toast';
import { notifyBellRefresh } from '../../components/layout/NotificationBell';
import {
  getProposalReachedStep,
  PROPOSAL_PROCESS_FIELD_KEYS
} from '../../utils/proposalProgress';
import {
  formatProposalCost,
  formatProposedScale,
  getLegalDocFiles,
  getModelLabel,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import {
  formatChotTotal,
  formatSignedTime,
  getSignStatusColor,
  getSignStatusLabel,
  SIGN_STATUS_HINTS
} from '../../utils/proposalSignature';
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  FileSignature,
  FileText,
  LayoutTemplate,
  Paperclip,
  PenSquare,
  Clock
} from 'lucide-react';

const LAYOUT_FIELD = 'ban_ve_layout';
const REPORT_FIELD = 'file_bc_dx';

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

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN', { hour12: false });
};

const InfoItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-base-content/60">{label}</span>
    <span className="text-sm font-medium break-words">{value || '-'}</span>
  </div>
);

const StepCard = ({ icon: Icon, title, subtitle, children }) => (
  <section className="border rounded-lg bg-base-100 p-4 space-y-3">
    <div className="flex items-start gap-2">
      {Icon && <span className="mt-0.5 text-primary"><Icon size={16} /></span>}
      <div>
        <h2 className="font-semibold text-sm">{title}</h2>
        {subtitle && <p className="text-xs text-base-content/60">{subtitle}</p>}
      </div>
    </div>
    {children}
  </section>
);

const FileChips = ({ files, emptyText, onView }) => {
  if (!files || files.length === 0) {
    return <p className="text-sm text-base-content/60">{emptyText || 'Chưa có tệp'}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file, index) => (
        <button
          key={`${file.id || 'f'}-${index}`}
          type="button"
          className="btn btn-ghost btn-xs gap-1"
          onClick={() => onView({ id: file.id, original_name: file.name, mime_type: file.mime_type })}
        >
          <Paperclip size={12} />
          {file.name || `File #${file.id}`}
        </button>
      ))}
    </div>
  );
};

const AdminProposalDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { getSelectOptions } = useFieldOptions('station_proposals', ['status', 'mo_hinh_dau_tu']);

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signatureDetail, setSignatureDetail] = useState(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendLoading, setExtendLoading] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendLimits, setExtendLimits] = useState(null);
  const [toast, setToast] = useState(null);

  const statusOptionMap = useMemo(() => {
    const map = {};
    (getSelectOptions('status') || []).forEach((option) => { map[option.value] = option; });
    return map;
  }, [getSelectOptions]);

  const modelOptions = getSelectOptions('mo_hinh_dau_tu');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token || !id) return;
      setLoading(true);
      setError('');
      try {
        const res = await adminProposalService.getById(id, token);
        if (!cancelled) setRecord(res?.data || null);
      } catch (err) {
        if (!cancelled) {
          setRecord(null);
          setError(err?.message || 'Không tải được thông tin đề xuất');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [id, token]);

  useEffect(() => {
    if (record?.status !== 'PENDING' || !record.transition_deadline_at) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [record?.status, record?.transition_deadline_at]);

  const canExtend = ['ADMIN', 'SUPER_ADMIN', 'SALES', 'CTV'].includes(user?.role)
    && record?.status === 'PENDING'
    && Number.isFinite(new Date(record.transition_deadline_at).getTime())
    && new Date(record.transition_deadline_at).getTime() > now;

  const openExtend = async () => {
    setExtendLoading(true);
    try {
      const res = await adminProposalService.extendInfo(record.id, token);
      if (!res?.success || !res.data) {
        throw new Error(res?.message || 'Không tải được thông tin gia hạn');
      }
      setExtendLimits({
        maxDaysPerTime: res.data.maxDaysPerTime,
        remaining: res.data.remaining,
        maxTimes: res.data.maxTimes
      });
      setExtendOpen(true);
    } catch (err) {
      setToast({ message: err?.message || 'Không tải được thông tin gia hạn', type: 'error' });
    } finally {
      setExtendLoading(false);
    }
  };

  const handleExtend = async ({ days, hours, reason }) => {
    if (!record?.id) return;
    setExtending(true);
    try {
      const res = await adminProposalService.extendDeadline(record.id, { days, hours, reason }, token);
      if (!res?.success) {
        throw new Error(res?.message || 'Gia hạn thất bại');
      }
      if (res.data) setRecord((current) => ({ ...current, ...res.data }));
      setExtendOpen(false);
      setToast({ message: res.message || 'Gia hạn thành công', type: 'success' });
      notifyBellRefresh();
    } catch (err) {
      setToast({ message: err?.message || 'Gia hạn thất bại', type: 'error' });
    } finally {
      setExtending(false);
    }
  };

  const recordStatus = record?.status;
  const recordId = record?.id;
  const hasSignatureStatus = recordStatus === 'SIGNATURE_PENDING'
    || (recordStatus === 'APPROVED' && Boolean(record?.signed_file_id));

  useEffect(() => {
    if (!token || !recordId || !hasSignatureStatus) {
      setSignatureDetail(null);
      setSignatureLoading(false);
      setSignatureError('');
      return undefined;
    }
    let cancelled = false;
    setSignatureDetail(null);
    setSignatureLoading(true);
    setSignatureError('');
    proposalSignatureService.getDetail(recordId, token)
      .then((res) => {
        if (!cancelled) setSignatureDetail(res?.data || null);
      })
      .catch((err) => {
        if (!cancelled) {
          setSignatureDetail(null);
          setSignatureError(err?.message || 'Không tải được thông tin trình ký');
        }
      })
      .finally(() => {
        if (!cancelled) setSignatureLoading(false);
      });
    return () => { cancelled = true; };
  }, [recordId, hasSignatureStatus, token]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="space-y-4">
        <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          Quay lại
        </button>
        <div className="alert alert-error text-sm">{error || 'Không tìm thấy đề xuất'}</div>
      </div>
    );
  }

  const statusOption = statusOptionMap[record.status];
  const statusColor = statusOption?.color || '#64748b';
  const statusLabel = statusOption?.label || record.status || '-';

  const layoutFiles = getLegalDocFiles(record, LAYOUT_FIELD);
  const reportFiles = getLegalDocFiles(record, REPORT_FIELD);
  const chotRows = parseChotRows(record.chot_so_luong_tru);
  const reachedStep = getProposalReachedStep(record, record.progress);

  const showGrading = record.quy_hoach_score !== null && record.quy_hoach_score !== undefined
    || record.phap_ly_score !== null && record.phap_ly_score !== undefined
    || reachedStep >= 1;
  const showLayout = layoutFiles.length > 0 || reachedStep >= 3;
  const showCommittedPoles = chotRows.length > 0 || reachedStep >= 4;
  const showReport = reportFiles.length > 0 || reachedStep >= 4;
  const showSignature = record.status === 'SIGNATURE_PENDING'
    || (record.status === 'APPROVED' && Boolean(record.signed_file_id));

  const signColor = signatureDetail ? getSignStatusColor(signatureDetail.sign_status) : '#64748b';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square shrink-0"
            onClick={() => navigate(-1)}
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{record.ma_de_xuat || `Đề xuất #${record.id}`}</h1>
              <span
                className="badge badge-sm whitespace-nowrap"
                style={{ backgroundColor: `${statusColor}1a`, color: statusColor, borderColor: statusColor }}
              >
                {statusLabel}
              </span>
            </div>
            <p className="text-sm text-base-content/60 mt-1">{getProposalAddress(record)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExtend && (
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1"
              onClick={openExtend}
              disabled={extendLoading}
              title="Gia hạn thời gian xử lý khi đề xuất đang còn hạn"
            >
              <Clock size={14} />
              {extendLoading ? 'Đang tải...' : 'Gia hạn'}
            </button>
          )}
          <ProposalLocationMapButton proposal={record} />
          {signatureDetail?.can_sign && (
            <button
              type="button"
              className="btn btn-primary btn-sm gap-1"
              onClick={() => navigate(`/admin/proposals/ky-bcdx/${record.id}`)}
            >
              <PenSquare size={14} />
              Ký BCĐX
            </button>
          )}
        </div>
      </div>

      <ProposalProgressiveDetails
        record={record}
        progress={record.progress}
        currentStep="all"
        showStepDetails={false}
        showNotes={false}
      />

      <section className="rounded-xl border border-base-300 bg-base-100 p-4">
        <h2 className="mb-3 text-sm font-semibold">Thông tin đề xuất</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <InfoItem label="Người đề xuất" value={record.user_name || record.owner_name} />
        <InfoItem label="Tên pháp nhân" value={getProposalLegalName(record)} />
        <InfoItem label="SĐT liên hệ" value={getProposalPhone(record)} />
        <InfoItem label="Mô hình đầu tư" value={getModelLabel(record.mo_hinh_dau_tu, modelOptions)} />
        <InfoItem label="Quy mô trụ đề xuất" value={formatProposedScale(record)} />
        <InfoItem label="Tổng chi phí" value={formatProposalCost(record)} />
        <InfoItem label="Ngày tạo" value={formatDate(record.created_at)} />
        <InfoItem label="Người phụ trách" value={record.nguoi_phu_trach?.label} />
        <InfoItem label="Mức độ xem xét" value={record.review_level ? `Mức ${record.review_level}` : '-'} />
        </div>
      </section>

      <section className="rounded-xl border border-base-300 bg-base-100 p-4">
        <h2 className="mb-3 text-sm font-semibold">Thông tin đề xuất chi tiết</h2>
        <DynamicForm
          entity="station_proposals"
          purpose="view"
          initialData={record}
          hideActions
          readOnlyKeys="*"
          excludeKeys={PROPOSAL_PROCESS_FIELD_KEYS}
        />
      </section>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-base-content/70 uppercase tracking-wide">Kết quả các bước xử lý</h2>

        {showGrading && (
          <StepCard icon={CheckCircle2} title="Đánh giá Quy hoạch và Pháp lý">
            <ProposalGradingSummary record={record} />
          </StepCard>
        )}

        {showLayout && (
          <StepCard icon={LayoutTemplate} title="Bản vẽ layout" subtitle="Tệp do phòng Công nghệ và Quy hoạch đẩy lên">
            <FileChips files={layoutFiles} emptyText="Chưa có bản vẽ layout" onView={setViewing} />
          </StepCard>
        )}

        {showCommittedPoles && (
          <StepCard icon={Calculator} title="Chốt số lượng trụ">
            {chotRows.length === 0 ? (
              <p className="text-sm text-base-content/60">Chưa có số lượng trụ chốt.</p>
            ) : (
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
                      <th className="text-right">{formatChotTotal(record.tong_gia_tri_chot)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </StepCard>
        )}

        {showReport && (
          <StepCard icon={FileText} title="Tờ trình BCĐX" subtitle="Tệp do Back Office / người đề xuất đẩy lên">
            <FileChips files={reportFiles} emptyText="Chưa có tờ trình BCĐX" onView={setViewing} />
          </StepCard>
        )}

        {showSignature && (
          <StepCard icon={FileSignature} title="Trình ký BCĐX">
            {signatureLoading ? (
              <div className="flex justify-center py-4"><span className="loading loading-spinner" /></div>
            ) : signatureError ? (
              <div className="alert alert-error text-sm">{signatureError}</div>
            ) : signatureDetail ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-base-content/70">Trạng thái ký:</span>
                  <span
                    className="badge badge-sm whitespace-nowrap"
                    style={{ backgroundColor: `${signColor}1a`, color: signColor, borderColor: signColor }}
                    title={SIGN_STATUS_HINTS[signatureDetail.sign_status] || ''}
                  >
                    {getSignStatusLabel(signatureDetail.sign_status)}
                  </span>
                  <span className="text-sm text-base-content/70">
                    {signatureDetail.signer_signed}/{signatureDetail.signer_total} người đã ký
                  </span>
                </div>

                {signatureDetail.signers?.length > 0 && (
                  <ul className="space-y-1">
                    {signatureDetail.signers.map((signer) => (
                      <li key={signer.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border-b last:border-b-0 py-1">
                        <span className="truncate">
                          {signer.full_name || `#${signer.user_id}`}
                          {signer.signer_title ? ` · ${signer.signer_title}` : ''}
                        </span>
                        <span className="text-xs text-base-content/60">
                          {signer.status === 'SIGNED'
                            ? `Đã ký${signer.signed_at ? ` · ${formatSignedTime(signer.signed_at)}` : ''}`
                            : 'Chờ ký'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {signatureDetail.signed_file_id && (
                  <div className="pt-1">
                    <p className="text-xs text-base-content/60 mb-1">File BCĐX đã ký</p>
                    <FileChips
                      files={[{ id: signatureDetail.signed_file_id, name: 'BCĐX đã ký' }]}
                      onView={setViewing}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-base-content/60">Chưa có dữ liệu cấu hình trình ký.</p>
            )}
          </StepCard>
        )}
      </div>

      {viewing && (
        <FileViewer file={viewing} onClose={() => setViewing(null)} fullScreen />
      )}
      <ExtendDeadlineDialog
        isOpen={extendOpen}
        saving={extending}
        limits={extendLimits}
        onConfirm={handleExtend}
        onCancel={() => { if (!extending) setExtendOpen(false); }}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default AdminProposalDetailPage;
