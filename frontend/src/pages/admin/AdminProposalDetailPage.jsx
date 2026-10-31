import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { adminProposalService, fieldDefinitionService, proposalSignatureService } from '../../services/api';
import useFieldOptions from '../../hooks/useFieldOptions';
import FileViewer from '../../components/dynamic/FileViewer';
import ProposalGradingSummary from '../../components/admin/ProposalGradingSummary';
import ProposalProgressiveDetails from '../../components/admin/ProposalProgressiveDetails';
import ProposalLocationMapButton from '../../components/admin/ProposalLocationMapButton';
import ProposalTableFieldValue from '../../components/admin/ProposalTableFieldValue';
import ProposalGoogleMapLink from '../../components/admin/ProposalGoogleMapLink';
import ExtendDeadlineDialog from '../../components/admin/ExtendDeadlineDialog';
import Toast from '../../components/Toast';
import { notifyBellRefresh } from '../../components/layout/NotificationBell';
import PageHeader from '../../components/ui/PageHeader';
import { ProposalModelBadge, ProposalStatusBadge } from '../../components/admin/ProposalTableBadges';
import {
  getProposalReachedStep,
  PROPOSAL_PROCESS_FIELD_KEYS
} from '../../utils/proposalProgress';
import {
  formatProposalCost,
  formatProposedScale,
  getFieldValue,
  getLegalDocFiles,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone,
  isProposalFieldForModel
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

const FIELD_GROUPS = [
  {
    title: 'Thông tin liên hệ và vị trí',
    matches: (key) => /^(owner_|user_|address|province|vung_mien|xa_phuong|latitude|longitude|land_type|dia_chi|sdt)/i.test(key)
  },
  {
    title: 'Mô hình và phương án đầu tư',
    matches: (key) => /^(mo_hinh|nq_|lk_|tdt_|chi_phi|loai_tru|chot_|tong_gia_tri|dat_coc|investment)/i.test(key)
  },
  {
    title: 'Hồ sơ đính kèm',
    matches: (key, field) => field.type === 'file' || /(file|document|legal|dkkd|cccd|giay_chung_nhan|ban_ve|hinh_anh)/i.test(key)
  }
];

const parseValue = (value) => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || !['[', '{'].includes(text[0])) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
};

const getFiles = (value) => {
  const parsed = parseValue(value);
  if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0) return [{ id: parsed }];
  if (typeof parsed === 'string' && parsed.trim()) {
    const id = Number(parsed);
    return Number.isInteger(id) && id > 0 ? [{ id }] : [{ name: parsed }];
  }
  if (Array.isArray(parsed)) return parsed.flatMap(getFiles);
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.files)) return getFiles(parsed.files);
    if (parsed.id || parsed.file_id) return [parsed];
    return Object.values(parsed).flatMap(getFiles);
  }
  return [];
};

const formatValue = (value) => {
  const parsed = parseValue(value);
  if (parsed === null || parsed === undefined || parsed === '') return '—';
  if (typeof parsed === 'boolean') return parsed ? 'Có' : 'Không';
  if (Array.isArray(parsed)) return parsed.length ? JSON.stringify(parsed, null, 2) : '—';
  if (typeof parsed === 'object') {
    const label = parsed.label || parsed.name || parsed.full_name || parsed.fullName || parsed.value;
    return label || JSON.stringify(parsed, null, 2);
  }
  return String(parsed);
};

const FieldValue = ({ field, value, record, onViewFile }) => {
  if (field.key === 'link_google_map') {
    return <ProposalGoogleMapLink value={value} />;
  }
  if (field.type === 'file') {
    const files = getFiles(value);
    if (!files.length) return <span className="text-base-content/50">—</span>;
    return (
      <div className="flex flex-col gap-1">
        {files.map((file, index) => {
          const fileId = file.id || file.file_id;
          if (!fileId) return <span key={`name-${index}`}>{file.name || file.original_name || 'Tệp đính kèm'}</span>;
          return (
            <button
              key={`${fileId}-${index}`}
              type="button"
              className="link link-primary inline-flex items-center gap-1 text-left"
              onClick={() => onViewFile({
                ...file,
                id: fileId,
                original_name: file.original_name || file.name || `Tệp #${fileId}`
              })}
            >
              <FileText size={14} />
              {file.original_name || file.name || `Tệp #${fileId}`}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.type === 'table') {
    return <ProposalTableFieldValue record={record} field={field} />;
  }
  return <span className="whitespace-pre-wrap break-words">{formatValue(value)}</span>;
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

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN', { hour12: false });
};

const InfoItem = ({ label, value, children }) => (
  <div className="min-w-0">
    <dt className="text-xs font-semibold text-base-content/60">{label}</dt>
    <dd className="mt-1 break-words text-sm font-medium">
      {children ?? (value === null || value === undefined || value === '' ? '—' : value)}
    </dd>
  </div>
);

const StepCard = ({ icon: Icon, title, subtitle, children }) => (
  <section className="space-y-4 rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
    <div className="flex items-start gap-2">
      {Icon && <span className="mt-0.5 text-primary"><Icon size={16} /></span>}
      <div>
        <h2 className="text-sm font-semibold sm:text-base">{title}</h2>
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
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
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
  const fieldGroups = useMemo(() => {
    const fields = (fieldDefinitions || [])
      .filter((field) => field.status !== 'inactive' || record?.[field.key] !== undefined)
      .filter((field) => !PROPOSAL_PROCESS_FIELD_KEYS.includes(field.key))
      .filter((field) => isProposalFieldForModel(field.key, record))
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const groups = FIELD_GROUPS.map((group) => ({ title: group.title, fields: [] }));
    const otherFields = [];
    fields.forEach((field) => {
      const groupIndex = FIELD_GROUPS.findIndex((group) => group.matches(field.key || '', field));
      if (groupIndex < 0) otherFields.push(field);
      else groups[groupIndex].fields.push(field);
    });
    if (otherFields.length) groups.push({ title: 'Thông tin bổ sung', fields: otherFields });
    return groups.filter((group) => group.fields.length);
  }, [fieldDefinitions, record]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token || !id) return;
      setLoading(true);
      setError('');
      try {
        const [res, fieldsRes] = await Promise.all([
          adminProposalService.getById(id, token),
          fieldDefinitionService.getByEntity('station_proposals')
        ]);
        if (!fieldsRes?.success || !Array.isArray(fieldsRes.data)) {
          throw new Error(fieldsRes?.message || 'Không tải được danh sách trường thông tin đề xuất');
        }
        if (!cancelled) {
          setRecord(res?.data || null);
          setFieldDefinitions(fieldsRes.data);
        }
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
    <div className="space-y-5">
      <PageHeader
        title={record.ma_de_xuat || `Đề xuất #${record.id}`}
        subtitle={(
          <div className="flex flex-wrap items-center gap-2">
            <ProposalStatusBadge value={record.status} optionMap={statusOptionMap} />
            <span className="text-sm">{getProposalAddress(record)}</span>
          </div>
        )}
        actions={(
          <>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square shrink-0"
            onClick={() => navigate(-1)}
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
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
          </>
        )}
      />

      <ProposalProgressiveDetails
        record={record}
        progress={record.progress}
        currentStep="all"
        showStepDetails={false}
        showNotes={false}
      />

      <section className="rounded-xl border border-base-300 bg-base-100 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Tóm tắt đề xuất</h2>
        </div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="Mã đề xuất" value={record.ma_de_xuat || `#${record.id}`} />
          <InfoItem label="Người đề xuất" value={record.user_name || record.owner_name} />
          <InfoItem label="Tên pháp nhân" value={getProposalLegalName(record)} />
          <InfoItem label="SĐT liên hệ" value={getProposalPhone(record)} />
          <InfoItem label="Mô hình đầu tư">
            <ProposalModelBadge value={record.mo_hinh_dau_tu} options={modelOptions} />
          </InfoItem>
          <InfoItem label="Địa chỉ" value={getProposalAddress(record)} />
          <InfoItem label="Quy mô trụ đề xuất" value={formatProposedScale(record)} />
          <InfoItem label="Tổng chi phí" value={formatProposalCost(record)} />
          <InfoItem label="Ngày tạo" value={formatDate(record.created_at)} />
          <InfoItem label="Người phụ trách" value={record.nguoi_phu_trach?.label} />
          <InfoItem label="Mức độ xem xét" value={record.review_level ? `Mức ${record.review_level}` : '—'} />
        </dl>
      </section>

      <section className="rounded-xl border border-base-300 bg-base-100 p-4">
        <div className="mb-4">
          <h2 className="font-semibold">Thông tin đề xuất chi tiết</h2>
          <p className="mt-1 text-sm text-base-content/60">Toàn bộ thông tin được sắp xếp theo nhóm để tiện theo dõi.</p>
        </div>
        {fieldGroups.length ? (
          <div className="space-y-5">
            {fieldGroups.map((group) => (
              <section key={group.title} className="rounded-lg border border-base-300 p-4">
                <h3 className="mb-3 text-sm font-semibold">{group.title}</h3>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.fields.map((field) => (
                    <InfoItem key={field.key} label={field.label || field.key}>
                      <FieldValue
                        field={field}
                        record={record}
                        value={getFieldValue(record, field.key)}
                        onViewFile={setViewing}
                      />
                    </InfoItem>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        ) : (
          <p className="text-sm text-base-content/60">Không có thông tin chi tiết để hiển thị.</p>
        )}
      </section>

      <div className="space-y-3">
        <div>
          <h2 className="font-semibold">Quy trình và kết quả xử lý</h2>
          <p className="mt-1 text-sm text-base-content/60">Tài liệu và kết quả được ghi nhận trong từng bước của đề xuất.</p>
        </div>

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
