import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalLayoutService } from '../../services/api';
import { getLegalDocFiles, isProposalFieldForModel } from '../../utils/proposalGrading';
import { getLayoutFiles } from '../../utils/proposalDesign';
import FileViewer from '../../components/dynamic/FileViewer';
import ProposalGradingSummary from '../../components/admin/ProposalGradingSummary';
import ProposalProgressiveDetails from '../../components/admin/ProposalProgressiveDetails';
import ProposalLocationMapButton from '../../components/admin/ProposalLocationMapButton';
import ProposalTableFieldValue from '../../components/admin/ProposalTableFieldValue';
import PageHeader from '../../components/ui/PageHeader';
import { PROPOSAL_PROCESS_FIELD_KEYS } from '../../utils/proposalProgress';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
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

const FieldValue = ({ record, field, onViewFile }) => {
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

  const value = record[field.key];
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

const AdminProposalLayoutDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fileViewing, setFileViewing] = useState(null);

  const loadDetail = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError('');
    try {
      const response = await proposalLayoutService.getDetail(id, token);
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
  const layoutFiles = proposal ? getLayoutFiles(proposal) : [];

  if (loading) {
    return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg" /></div>;
  }

  if (error || !proposal) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-1"
          onClick={() => navigate('/admin/proposals/danh-gia-layout')}
        >
          <ArrowLeft size={16} /> Quay lại đánh giá layout
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
          <>
            <ProposalLocationMapButton proposal={proposal} />
            <button
              type="button"
              className="btn btn-ghost btn-sm gap-1"
              onClick={() => navigate('/admin/proposals/danh-gia-layout')}
            >
              <ArrowLeft size={16} /> Quay lại
            </button>
          </>
        )}
      />

      <ProposalProgressiveDetails
        record={proposal}
        progress={detail.progress}
        currentStep={3}
        onViewFile={setFileViewing}
        showNotes={false}
        showCurrentStatus={false}
        omitStepDetails={['grading', 'review']}
      />

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <div className="mb-1">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Đề xuất</p>
            <h2 className="card-title text-base">{proposal.ma_de_xuat || `#${proposal.id}`}</h2>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="font-semibold">Người đề xuất:</span> {proposal.user_name || 'Khách'}</div>
            <div><span className="font-semibold">Người phụ trách:</span> {proposal.manager_name || '—'}</div>
            <div><span className="font-semibold">Ngày tạo:</span> {formatDate(proposal.created_at)}</div>
            <div><span className="font-semibold">Mô hình:</span> {displayValue(proposal.mo_hinh_dau_tu)}</div>
            <div><span className="font-semibold">Miền:</span> {displayValue(proposal.vung_mien)}</div>
            <div><span className="font-semibold">Pháp nhân:</span> {proposal.owner_name || '—'}</div>
            <div><span className="font-semibold">SĐT:</span> {proposal.owner_phone || '—'}</div>
            <div className="sm:col-span-2 lg:col-span-4">
              <span className="font-semibold">Địa chỉ:</span> {proposal.address || '—'}
            </div>
          </div>
        </div>
      </section>

      <ProposalGradingSummary record={proposal} />

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <h2 className="card-title text-base">Bản vẽ layout</h2>
          {layoutFiles.length === 0 ? (
            <p className="text-sm text-base-content/60">Chưa có bản vẽ layout.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {layoutFiles.map((file, index) => (
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
                  <p className="mb-1 text-xs font-semibold text-base-content/60">{field.label || field.key}</p>
                  <FieldValue record={proposal} field={field} onViewFile={setFileViewing} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {fileViewing && <FileViewer file={fileViewing} onClose={() => setFileViewing(null)} fullScreen />}
    </div>
  );
};

export default AdminProposalLayoutDetailPage;
