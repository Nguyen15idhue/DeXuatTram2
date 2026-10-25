import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Pencil } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalReportService } from '../../services/api';
import { getLegalDocFiles } from '../../utils/proposalGrading';
import { getReportFiles, canUploadReport, uploadButtonLabel } from '../../utils/proposalReport';
import FileViewer from '../../components/dynamic/FileViewer';
import ProposalReportSummary from '../../components/admin/ProposalReportSummary';
import ProposalReportUpdateModal from '../../components/admin/ProposalReportUpdateModal';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/Toast';

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
  const output = displayValue(value);
  return typeof value === 'object' && value !== null
    ? <pre className="whitespace-pre-wrap break-words text-sm">{output}</pre>
    : <span className="whitespace-pre-wrap break-words">{output}</span>;
};

const hasValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  return !Array.isArray(value) || value.length > 0;
};

const REQUEST_LABELS = {
  REVISE_BCDX: 'Yêu cầu cập nhật BCĐX',
  LAYOUT_SUPPLEMENT: 'Yêu cầu bổ sung layout',
  UPDATE_INFO: 'Yêu cầu bổ sung thông tin'
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
    .filter((field) => field.status !== 'inactive' && hasValue(proposal?.[field.key]))
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
        subtitle="Thông tin đề xuất, kết quả chấm điểm, bản vẽ layout và lịch sử lập BCĐX"
        actions={(
          <div className="flex gap-2">
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

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <h2 className="card-title text-base">Thông tin quy trình</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div><span className="font-semibold">Mã đề xuất:</span> {proposal.ma_de_xuat || `#${proposal.id}`}</div>
            <div><span className="font-semibold">Trạng thái:</span> {proposal.status}</div>
            <div><span className="font-semibold">Người đề xuất:</span> {proposal.user_name || 'Khách'}</div>
            <div><span className="font-semibold">Ngày tạo:</span> {formatDate(proposal.created_at)}</div>
            <div><span className="font-semibold">Mô hình:</span> {displayValue(proposal.mo_hinh_dau_tu)}</div>
            <div><span className="font-semibold">Miền:</span> {displayValue(proposal.vung_mien)}</div>
            <div><span className="font-semibold">Pháp nhân:</span> {proposal.owner_name || '—'}</div>
            <div><span className="font-semibold">SĐT:</span> {proposal.owner_phone || '—'}</div>
          </div>
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

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <h2 className="card-title text-base">Yêu cầu liên quan</h2>
          {(detail.requests || []).length === 0 ? (
            <p className="text-sm text-base-content/60">Chưa có yêu cầu bổ sung hoặc cập nhật.</p>
          ) : (
            <div className="space-y-3">
              {detail.requests.map((request) => (
                <article key={request.id} className="border border-base-200 rounded-lg p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <strong>{REQUEST_LABELS[request.request_type] || request.request_type}</strong>
                    <span className={`badge badge-sm ${request.status === 'OPEN' ? 'badge-warning' : 'badge-success'}`}>
                      {request.status === 'OPEN' ? 'Đang mở' : request.status === 'DONE' ? 'Đã hoàn thành' : request.status}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap mt-2">{request.description || '—'}</p>
                  <p className="text-xs text-base-content/60 mt-2">
                    {request.requester_name || 'Hệ thống'} · {formatDate(request.created_at)}
                  </p>
                  {request.resolution_note && (
                    <p className="text-sm mt-2"><strong>Kết quả:</strong> {request.resolution_note}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <h2 className="card-title text-base">Lịch sử xử lý từ lúc tạo đề xuất</h2>
          {(detail.activity || []).length === 0 ? (
            <p className="text-sm text-base-content/60">Chưa có lịch sử xử lý.</p>
          ) : (
            <ol className="space-y-3">
              {detail.activity.map((event) => (
                <li key={event.id} className="border-l-2 border-primary/30 pl-3">
                  <p className="font-semibold text-sm">{event.action || event.action_type || 'Cập nhật'}</p>
                  <p className="text-xs text-base-content/60">
                    {event.actor_name || 'Hệ thống'} · {formatDate(event.created_at)}
                  </p>
                  {event.from_status || event.to_status ? (
                    <p className="text-sm mt-1">{event.from_status || '—'} → {event.to_status || '—'}</p>
                  ) : null}
                  {event.reason && <p className="text-sm mt-1 whitespace-pre-wrap">{event.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {fileViewing && <FileViewer file={fileViewing} onClose={() => setFileViewing(null)} />}
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
