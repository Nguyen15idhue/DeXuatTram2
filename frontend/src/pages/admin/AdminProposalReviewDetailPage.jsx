import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import ReviewActionDialog from '../../components/admin/ReviewActionDialog';
import { ProposalModelBadge, ProposalStatusBadge } from '../../components/admin/ProposalTableBadges';
import Toast from '../../components/Toast';
import ProposalProgressiveDetails from '../../components/admin/ProposalProgressiveDetails';
import ProposalLocationMapButton from '../../components/admin/ProposalLocationMapButton';
import ProposalTableFieldValue from '../../components/admin/ProposalTableFieldValue';
import FileViewer from '../../components/dynamic/FileViewer';
import { PROPOSAL_PROCESS_FIELD_KEYS } from '../../utils/proposalProgress';
import { useAuth } from '../../contexts/AuthContext';
import { proposalReviewService } from '../../services/api';
import useFieldOptions from '../../hooks/useFieldOptions';
import {
  formatProposalCost,
  formatProposedScale,
  isProposalFieldForModel,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { getReviewLevelLabel } from '../../utils/proposalReview';

const ACTIONS = {
  regrade: {
    title: 'Yêu cầu đánh giá lại',
    description: 'Chọn phòng cần chấm lại và ghi rõ lý do yêu cầu.',
    confirmText: 'Gửi yêu cầu',
    confirmClass: 'btn-warning',
    api: proposalReviewService.requestRegrade
  },
  cancelGdttkd: {
    title: 'Xác nhận hủy đề xuất',
    description: 'Đề xuất sẽ bị hủy và không tiếp tục quy trình.',
    confirmText: 'Xác nhận hủy',
    confirmClass: 'btn-error',
    api: proposalReviewService.cancel
  },
  toTgd: {
    title: 'Trình Tổng Giám đốc xem xét',
    description: 'Đề xuất sẽ được chuyển đến Tổng Giám đốc xem xét.',
    confirmText: 'Trình TGĐ',
    confirmClass: 'btn-primary',
    api: proposalReviewService.toTgd
  },
  cancelTgd: {
    title: 'Đồng ý hủy đề xuất',
    description: 'Đề xuất sẽ bị hủy và không tiếp tục quy trình.',
    confirmText: 'Đồng ý hủy',
    confirmClass: 'btn-error',
    api: proposalReviewService.reject
  },
  approve: {
    title: 'Xác nhận duyệt đề xuất',
    description: 'Đề xuất sẽ được duyệt và chuyển sang bước tiếp theo.',
    confirmText: 'Xác nhận duyệt',
    confirmClass: 'btn-success',
    api: proposalReviewService.approve
  }
};

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

const DetailField = ({ label, children, value }) => (
  <div className="min-w-0">
    <dt className="text-xs font-semibold text-base-content/60">{label}</dt>
    <dd className="mt-1 break-words text-sm">{children ?? value ?? '—'}</dd>
  </div>
);

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const AdminProposalReviewDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu', 'status']);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionType, setActionType] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [fileViewing, setFileViewing] = useState(null);

  const loadDetail = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError('');
    try {
      const response = await proposalReviewService.getDetail(id, token);
      setDetail(response?.data || null);
    } catch (loadError) {
      setError(loadError?.message || 'Không tải được chi tiết đề xuất');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const proposal = detail?.proposal;
  const fieldGroups = useMemo(() => {
    const fields = (detail?.fieldDefinitions || [])
      .filter((field) => field.status !== 'inactive' || proposal?.[field.key] !== undefined)
      .filter((field) => !PROPOSAL_PROCESS_FIELD_KEYS.includes(field.key))
      .filter((field) => isProposalFieldForModel(field.key, proposal))
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
  }, [detail?.fieldDefinitions, proposal]);

  const permissions = detail?.permissions || {};
  const statusOptions = getSelectOptions('status');
  const modelOptions = getSelectOptions('mo_hinh_dau_tu');
  const activeAction = ACTIONS[actionType];

  const submitAction = async (reason, options = {}) => {
    if (!proposal || !activeAction) return;
    setSaving(true);
    setActionError('');
    try {
      const result = await activeAction.api(proposal.id, { reason, ...options }, token);
      setActionType('');
      setToast(result?.message || activeAction.confirmText);
      await loadDetail();
    } catch (actionFailure) {
      setActionError(actionFailure?.message || 'Không thực hiện được thao tác');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg" /></div>;
  if (error || !proposal) {
    return (
      <div className="space-y-4">
        <div className="alert alert-error">{error || 'Không tìm thấy đề xuất'}</div>
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Trở về
        </button>
      </div>
    );
  }

  const showGdttkdAction = permissions.canRequestRegrade || permissions.canCancelGdttkd || permissions.canSubmitToTgd;
  const showTgdAction = permissions.canCancelTgd || permissions.canApproveTgd;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Chi tiết yêu cầu chấm điểm lại — ${proposal.ma_de_xuat || `#${proposal.id}`}`}
        actions={<ProposalLocationMapButton proposal={proposal} />}
      />
      <ProposalProgressiveDetails
        record={proposal}
        progress={detail.progress}
        currentStep={2}
        onViewFile={setFileViewing}
        showNotes={false}
        omitStepDetails={['grading']}
      />

      <section className="rounded-lg border bg-base-100 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Tóm tắt đề xuất</h2>
          <ProposalStatusBadge value={proposal.status} optionMap={statusOptions} />
        </div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Mã đề xuất" value={proposal.ma_de_xuat || `#${proposal.id}`} />
          <DetailField label="Người đề xuất" value={proposal.user_name || proposal.owner_name} />
          <DetailField label="Tên pháp nhân" value={getProposalLegalName(proposal)} />
          <DetailField label="SĐT liên hệ" value={getProposalPhone(proposal)} />
          <DetailField label="Mô hình đầu tư">
            <ProposalModelBadge value={proposal.mo_hinh_dau_tu} options={modelOptions} />
          </DetailField>
          <DetailField label="Địa chỉ" value={getProposalAddress(proposal)} />
          <DetailField label="Quy mô trụ đề xuất" value={formatProposedScale(proposal)} />
          <DetailField label="Tổng chi phí dự kiến" value={formatProposalCost(proposal)} />
          <DetailField label="Mức độ xem xét" value={getReviewLevelLabel(proposal.review_level)} />
          <DetailField label="Ngày tạo" value={formatDateTime(proposal.created_at)} />
        </dl>
      </section>

      <section className="rounded-lg border bg-base-100 p-4">
        <h2 className="mb-3 font-semibold">Kết quả chấm Quy hoạch và Pháp lý</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <ScoreSummary title="Quy hoạch" score={proposal.quy_hoach_score} note={proposal.quy_hoach_note} />
          <ScoreSummary title="Pháp lý" score={proposal.phap_ly_score} note={proposal.phap_ly_note} />
        </div>
      </section>

      {fieldGroups.map((group) => (
        <section key={group.title} className="rounded-lg border bg-base-100 p-4">
          <h2 className="mb-3 font-semibold">{group.title}</h2>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.fields.map((field) => (
              <DetailField key={field.key} label={field.label || field.key}>
                <FieldValue
                  field={field}
                  record={proposal}
                  value={proposal[field.key]}
                  onViewFile={setFileViewing}
                />
              </DetailField>
            ))}
          </dl>
        </section>
      ))}

      {(showGdttkdAction || showTgdAction) && (
        <section className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {permissions.canRequestRegrade && (
            <button type="button" className="btn btn-warning" onClick={() => { setActionError(''); setActionType('regrade'); }}>
              Yêu cầu đánh giá lại
            </button>
          )}
          {permissions.canCancelGdttkd && (
            <button type="button" className="btn btn-error" onClick={() => { setActionError(''); setActionType('cancelGdttkd'); }}>
              Xác nhận hủy
            </button>
          )}
          {permissions.canSubmitToTgd && (
            <button type="button" className="btn btn-primary" onClick={() => { setActionError(''); setActionType('toTgd'); }}>
              Trình TGĐ xem xét
            </button>
          )}
          {permissions.canCancelTgd && (
            <button type="button" className="btn btn-error" onClick={() => { setActionError(''); setActionType('cancelTgd'); }}>
              Đồng ý hủy
            </button>
          )}
          {permissions.canApproveTgd && (
            <button type="button" className="btn btn-success" onClick={() => { setActionError(''); setActionType('approve'); }}>
              Xác nhận duyệt
            </button>
          )}
        </section>
      )}

      <div className="flex justify-end">
        <button type="button" className="btn btn-ghost gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Trở về
        </button>
      </div>

      <ReviewActionDialog
        isOpen={!!actionType}
        title={activeAction?.title || ''}
        description={activeAction?.description || ''}
        confirmText={activeAction?.confirmText || 'Xác nhận'}
        confirmClass={activeAction?.confirmClass || 'btn-primary'}
        reasonLabel={actionType === 'regrade' ? 'Lý do yêu cầu đánh giá lại' : 'Lý do'}
        reasonPlaceholder={actionType === 'regrade' ? 'Nhập lý do yêu cầu chấm lại...' : 'Nhập lý do...'}
        showDepartmentSelection={actionType === 'regrade'}
        saving={saving}
        error={actionError}
        onClose={() => !saving && setActionType('')}
        onConfirm={submitAction}
      />
      {fileViewing && <FileViewer file={fileViewing} onClose={() => setFileViewing(null)} fullScreen />}
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  );
};

const ScoreSummary = ({ title, score, note }) => (
  <div className="rounded-lg border border-base-300 p-3">
    <h3 className="text-sm font-semibold">{title}</h3>
    <div className="mt-2 flex items-start gap-2">
      <span className={`badge ${score === 0 ? 'badge-error' : score == null ? 'badge-ghost' : 'badge-info'}`}>
        {score === null || score === undefined ? 'Chưa chấm' : `${score}/3`}
      </span>
      {note && <p className="whitespace-pre-wrap text-sm text-base-content/70">{note}</p>}
    </div>
  </div>
);

export default AdminProposalReviewDetailPage;
