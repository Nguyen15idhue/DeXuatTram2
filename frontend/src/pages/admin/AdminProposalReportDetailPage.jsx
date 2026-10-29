import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Pencil } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalReportService } from '../../services/api';
import {
  formatProposalCost,
  formatProposedScale,
  getLegalDocFiles,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone,
  isProposalFieldForModel
} from '../../utils/proposalGrading';
import { getReportFiles, canUploadReport, uploadButtonLabel } from '../../utils/proposalReport';
import FileViewer from '../../components/dynamic/FileViewer';
import ProposalReportSummary from '../../components/admin/ProposalReportSummary';
import ProposalReportUpdateModal from '../../components/admin/ProposalReportUpdateModal';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/Toast';
import ProposalProgressiveDetails from '../../components/admin/ProposalProgressiveDetails';
import ProposalLocationMapButton from '../../components/admin/ProposalLocationMapButton';
import ProposalTableFieldValue from '../../components/admin/ProposalTableFieldValue';
import { getProposalStatusLabel, PROPOSAL_PROCESS_FIELD_KEYS } from '../../utils/proposalProgress';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const formatExpectedOnDate = (value) => {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '—';
};

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'object') {
    const label = value.label || value.name || value.full_name || value.value;
    return label || JSON.stringify(value, null, 2);
  }
  return String(value);
};

const OverviewItem = ({ label, value }) => (
  <div className="min-w-0 rounded-lg border border-base-200 p-3">
    <dt className="text-xs text-base-content/60">{label}</dt>
    <dd className="mt-1 break-words text-sm font-medium">{value || '—'}</dd>
  </div>
);

const FieldValue = ({ record, field, onViewFile }) => {
  const value = record[field.key];
  if (field.type === 'file') {
    const files = getLegalDocFiles(record, field.key);
    if (files.length === 0) return <span className="text-base-content/50">—</span>;
    return (
      <div className="flex flex-col gap-1">
        {files.map((file, index) => (
          <button
            key={`${file.id || file.name}-${index}`}
            type="button"
            className="link link-primary inline-flex items-center gap-1 text-left"
            onClick={() => onViewFile(file)}
          >
            <FileText size={14} />
            {file.name || `Tệp #${file.id}`}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === 'table') {
    return <ProposalTableFieldValue record={record} field={field} />;
  }
  const output = displayValue(value);
  return typeof value === 'object' && value !== null
    ? <pre className="whitespace-pre-wrap break-words text-sm">{output}</pre>
    : <span className="whitespace-pre-wrap break-words">{output}</span>;
};

const hasValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  return !Array.isArray(value) || value.length > 0;
};

const AdminProposalReportDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fileViewing, setFileViewing] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState('');

  const loadDetail = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError('');
    try {
      const response = await proposalReportService.getDetail(id, token);
      setDetail(response?.data || null);
    } catch (loadError) {
      setDetail(null);
      setError(loadError?.message || 'Không tải được chi tiết đề xuất');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const proposal = detail?.proposal;
  const fields = useMemo(() => (detail?.fieldDefinitions || [])
    .filter((field) => field.status !== 'inactive'
      && hasValue(proposal?.[field.key])
      && !PROPOSAL_PROCESS_FIELD_KEYS.includes(field.key)
      && isProposalFieldForModel(field.key, proposal))
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)), [detail, proposal]);
  const reportFiles = proposal ? getReportFiles(proposal) : [];

  const handleUploaded = async () => {
    setUploadOpen(false);
    setToast('Đã cập nhật tờ trình BCĐX');
    await loadDetail();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg" /></div>;
  }
  if (error || !proposal) {
    return (
      <div className="space-y-4">
        <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Quay lại
        </button>
        <div className="alert alert-error">{error || 'Không tìm thấy đề xuất'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Chi tiết đề xuất ${proposal.ma_de_xuat || `#${proposal.id}`}`}
        actions={(
          <div className="flex gap-2">
            <ProposalLocationMapButton proposal={proposal} />
            {detail.permissions?.canUpload && canUploadReport(proposal) && (
              <button type="button" className="btn btn-primary btn-sm gap-1" onClick={() => setUploadOpen(true)}>
                <Pencil size={14} /> {uploadButtonLabel(proposal)}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} /> Quay lại
            </button>
          </div>
        )}
      />

      <ProposalProgressiveDetails
        record={proposal}
        progress={detail.progress}
        currentStep={4}
        onViewFile={setFileViewing}
        showNotes={false}
        omitStepDetails={['grading', 'layout']}
      />

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Tổng quan đề xuất</p>
              <h2 className="card-title text-base">{proposal.ma_de_xuat || `#${proposal.id}`}</h2>
            </div>
            <span className="badge badge-outline">{getProposalStatusLabel(proposal.status)}</span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <OverviewItem label="Người đề xuất" value={proposal.user_name || proposal.owner_name || 'Khách'} />
            <OverviewItem label="Tên pháp nhân" value={getProposalLegalName(proposal)} />
            <OverviewItem label="SĐT liên hệ" value={getProposalPhone(proposal)} />
            <OverviewItem label="Mô hình đầu tư" value={displayValue(proposal.mo_hinh_dau_tu)} />
            <OverviewItem label="Miền / tỉnh" value={[displayValue(proposal.vung_mien), displayValue(proposal.province)].filter((value) => value !== '—').join(' · ')} />
            <OverviewItem label="Quy mô trụ đề xuất" value={formatProposedScale(proposal)} />
            <OverviewItem label="Tổng chi phí dự kiến" value={formatProposalCost(proposal)} />
            <OverviewItem label="Ngày dự kiến ON" value={formatExpectedOnDate(proposal.ngay_du_kien_on)} />
            <OverviewItem label="Ngày tạo" value={formatDate(proposal.created_at)} />
            <OverviewItem label="Địa chỉ" value={getProposalAddress(proposal)} />
          </dl>
        </div>
      </section>

      <ProposalReportSummary record={proposal} />

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <h2 className="card-title text-base">File tờ trình BCĐX</h2>
          {reportFiles.length === 0 ? (
            <p className="text-sm text-base-content/60">Chưa có file tờ trình.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {reportFiles.map((file, index) => (
                <button
                  key={`${file.id || file.name}-${index}`}
                  type="button"
                  className="btn btn-outline btn-sm gap-1"
                  onClick={() => setFileViewing(file)}
                >
                  <FileText size={14} /> {file.name || `Tệp #${file.id}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <h2 className="card-title text-base">Thông tin đã nhập khi tạo đề xuất</h2>
          {fields.length === 0 ? (
            <p className="text-sm text-base-content/60">Không có dữ liệu đầu vào để hiển thị.</p>
          ) : (
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.key} className="min-w-0 border-b border-base-200 pb-3">
                  <p className="text-xs font-semibold text-base-content/60 mb-1">{field.label || field.key}</p>
                  <FieldValue record={proposal} field={field} onViewFile={setFileViewing} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {fileViewing && <FileViewer file={fileViewing} onClose={() => setFileViewing(null)} fullScreen />}
      <ProposalReportUpdateModal
        open={uploadOpen}
        record={proposal}
        onClose={() => setUploadOpen(false)}
        onSaved={handleUploaded}
      />
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  );
};

export default AdminProposalReportDetailPage;
