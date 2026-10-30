import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Paperclip, PenSquare, RefreshCw, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import ReviewActionDialog from '../../components/admin/ReviewActionDialog';
import { ProposalModelBadge, ProposalStatusBadge } from '../../components/admin/ProposalTableBadges';
import FileViewer from '../../components/dynamic/FileViewer';
import { useAuth } from '../../contexts/AuthContext';
import { proposalApprovalService } from '../../services/api';
import useFieldOptions from '../../hooks/useFieldOptions';
import {
  formatProposalCost,
  formatProposedScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { canConfigureSignature, canRequestUpdate, getReportFiles } from '../../utils/proposalApproval';
import ProposalProgressiveDetails from '../../components/admin/ProposalProgressiveDetails';
import ProposalLocationMapButton from '../../components/admin/ProposalLocationMapButton';
import ProposalStaticInfo from '../../components/admin/ProposalStaticInfo';

const AdminProposalApprovalDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu', 'status']);
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialogType, setDialogType] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [fileViewing, setFileViewing] = useState(null);

  const loadProposal = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError('');
    try {
      const response = await proposalApprovalService.getProposal(id, token);
      setProposal(response?.data || null);
    } catch (loadError) {
      setError(loadError?.message || 'Không tải được thông tin đề xuất');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    loadProposal();
  }, [loadProposal]);

  const reportFiles = getReportFiles(proposal);
  const previewFileId = searchParams.get('previewFile');
  const previewFile = reportFiles.find((file) => String(file.id) === previewFileId);
  const modelOptions = getSelectOptions('mo_hinh_dau_tu');
  const statusOptionMap = Object.fromEntries(
    (getSelectOptions('status') || []).map((option) => [option.value, option])
  );
  const reviewable = proposal?.status === 'PROPOSAL_REPORT_REVIEWING';

  const submitAction = async (value) => {
    if (!proposal) return;
    setSaving(true);
    setActionError('');
    try {
      const response = dialogType === 'reject'
        ? await proposalApprovalService.tgdReject(proposal.id, { reason: value }, token)
        : await proposalApprovalService.requestUpdate(proposal.id, { description: value }, token);
      setDialogType('');
      setSuccess(response?.message || (dialogType === 'reject'
        ? 'Đã từ chối duyệt BCĐX'
        : 'Đã yêu cầu cập nhật thông tin'));
      await loadProposal();
    } catch (actionFailure) {
      setActionError(actionFailure?.message || 'Không thực hiện được thao tác');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg" /></div>;
  }

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

  if (previewFileId) {
    if (!previewFile) {
      return (
        <div className="space-y-4">
          <div className="alert alert-error">Không tìm thấy file tờ trình BCĐX.</div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate(`/admin/proposals/duyet-bcdx/${proposal.id}`)}
          >
            <ArrowLeft size={16} /> Quay lại chi tiết
          </button>
        </div>
      );
    }
    return (
      <FileViewer
        file={{ id: previewFile.id, original_name: previewFile.name, mime_type: previewFile.mime_type }}
        fullScreen
        onClose={() => navigate(`/admin/proposals/duyet-bcdx/${proposal.id}`)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Chi tiết duyệt BCĐX — ${proposal.ma_de_xuat || `#${proposal.id}`}`}
        actions={<ProposalLocationMapButton proposal={proposal} />}
      />

      {success && <div className="alert alert-success py-2">{success}</div>}
      <ProposalProgressiveDetails
        record={proposal}
        progress={proposal.progress}
        currentStep={5}
        onViewFile={setFileViewing}
        showNotes={false}
      />
      <section className="rounded-lg border bg-base-100 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Thông tin cơ bản</h2>
          <ProposalStatusBadge value={proposal.status} optionMap={statusOptionMap} />
        </div>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Mã đề xuất" value={proposal.ma_de_xuat || `#${proposal.id}`} />
          <DetailField label="Tên pháp nhân" value={getProposalLegalName(proposal)} />
          <DetailField label="SĐT liên hệ" value={getProposalPhone(proposal)} />
          <DetailField label="Mô hình đầu tư">
            <ProposalModelBadge value={proposal.mo_hinh_dau_tu} options={modelOptions} />
          </DetailField>
          <DetailField label="Địa chỉ" value={getProposalAddress(proposal)} />
          <DetailField label="Quy mô trụ đề xuất" value={formatProposedScale(proposal)} />
          <DetailField label="Tổng chi phí dự kiến" value={formatProposalCost(proposal)} />
          <DetailField label="Người đề xuất" value={proposal.user_name || proposal.owner_name} />
          <DetailField label="Mô tả việc cần làm" value={proposal.task_description} />
        </dl>
      </section>

      <ProposalStaticInfo record={proposal} onViewFile={setFileViewing} />

      <section className="space-y-3 rounded-lg border bg-base-100 p-4">
        <div className="flex items-center gap-2">
          <FileText size={18} />
          <h2 className="font-semibold">Tờ trình BCĐX</h2>
        </div>
        {reportFiles.length === 0 ? (
          <div className="alert">Đề xuất chưa có file tờ trình BCĐX.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {reportFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                className="btn btn-outline btn-sm gap-2"
                onClick={() => setFileViewing({
                  id: file.id,
                  original_name: file.name,
                  mime_type: file.mime_type
                })}
              >
                <Paperclip size={14} />
                {file.name || `Tệp #${file.id}`}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <button
          type="button"
          className="btn btn-success gap-2"
          disabled={!canConfigureSignature(proposal)}
          title={!reviewable ? 'Chỉ khả dụng khi đề xuất đang chờ duyệt BCĐX' : ''}
          onClick={() => navigate(`/admin/proposals/duyet-bcdx/${proposal.id}/cau-hinh-ky`)}
        >
          <PenSquare size={16} /> Cấu hình ký
        </button>
        <button
          type="button"
          className="btn btn-warning gap-2"
          disabled={!canRequestUpdate(proposal)}
          title={!reviewable ? 'Chỉ khả dụng khi đề xuất đang chờ duyệt BCĐX' : ''}
          onClick={() => { setActionError(''); setDialogType('update'); }}
        >
          <RefreshCw size={16} /> Yêu cầu cập nhật thông tin
        </button>
        <button
          type="button"
          className="btn btn-error gap-2"
          disabled={!reviewable}
          title={!reviewable ? 'Chỉ khả dụng khi đề xuất đang chờ duyệt BCĐX' : ''}
          onClick={() => { setActionError(''); setDialogType('reject'); }}
        >
          <XCircle size={16} /> Từ chối duyệt
        </button>
        <button type="button" className="btn btn-ghost gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Trở về
        </button>
      </div>

      <ReviewActionDialog
        isOpen={!!dialogType}
        title={dialogType === 'reject' ? 'Từ chối duyệt BCĐX' : 'Yêu cầu cập nhật thông tin'}
        description={`Đề xuất ${proposal.ma_de_xuat || ''}: ${dialogType === 'reject'
          ? 'nhập lý do từ chối duyệt. Đề xuất sẽ chuyển sang chờ cập nhật lại BCĐX.'
          : 'mô tả nội dung cần cập nhật để gửi cho người tạo đề xuất.'}`}
        confirmText={dialogType === 'reject' ? 'Từ chối duyệt' : 'Gửi yêu cầu'}
        confirmClass={dialogType === 'reject' ? 'btn-error' : 'btn-warning'}
        reasonLabel={dialogType === 'reject' ? 'Lý do từ chối' : 'Nội dung cần cập nhật'}
        reasonPlaceholder={dialogType === 'reject' ? 'Nhập lý do từ chối duyệt...' : 'Nhập nội dung cần cập nhật...'}
        saving={saving}
        error={actionError}
        onClose={() => { if (!saving) setDialogType(''); }}
        onConfirm={submitAction}
      />
      {fileViewing && (
        <FileViewer
          file={fileViewing}
          onClose={() => setFileViewing(null)}
          fullScreen
        />
      )}
    </div>
  );
};

const DetailField = ({ label, value, children }) => (
  <div className="min-w-0">
    <dt className="text-xs text-base-content/60">{label}</dt>
    <dd className="mt-1 break-words text-sm">{children || value || '—'}</dd>
  </div>
);

export default AdminProposalApprovalDetailPage;
