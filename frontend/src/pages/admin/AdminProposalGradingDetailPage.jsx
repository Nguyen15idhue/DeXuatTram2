import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalGradingService } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import ProposalGradingModal from '../../components/admin/ProposalGradingModal';
import ProposalProgressiveDetails from '../../components/admin/ProposalProgressiveDetails';
import ProposalLocationMapButton from '../../components/admin/ProposalLocationMapButton';
import ProposalTableFieldValue from '../../components/admin/ProposalTableFieldValue';
import FileViewer from '../../components/dynamic/FileViewer';
import Toast from '../../components/Toast';
import { PROPOSAL_PROCESS_FIELD_KEYS } from '../../utils/proposalProgress';
import { isProposalFieldForModel } from '../../utils/proposalGrading';

const getStep = (proposal, permissions = {}) => {
  if (proposal?.status !== 'RE_GRADING') return 'grading';
  const isRegradingTask = (permissions.canGradeQH && proposal.quy_hoach_regrade_pending)
    || (permissions.canGradePL && proposal.phap_ly_regrade_pending);
  return isRegradingTask ? 'regrading' : 'grading';
};

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

const displayValue = (value) => {
  const parsed = parseValue(value);
  if (parsed === null || parsed === undefined || parsed === '') return '—';
  if (typeof parsed === 'boolean') return parsed ? 'Có' : 'Không';
  if (typeof parsed === 'object') {
    const label = parsed.label || parsed.name || parsed.full_name || parsed.value;
    return label || JSON.stringify(parsed, null, 2);
  }
  return String(parsed);
};

const FieldValue = ({ field, record, value, token }) => {
  if (field.type === 'file') {
    const files = getFiles(value);
    if (!files.length) return <span className="text-base-content/50">—</span>;
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    return (
      <div className="flex flex-col gap-1">
        {files.map((file, index) => {
          const id = file.id || file.file_id;
          if (!id) return <span key={index}>{file.name || file.original_name || 'Tệp đính kèm'}</span>;
          return (
            <a
              key={`${id}-${index}`}
              className="link link-primary inline-flex items-center gap-1"
              href={`${apiUrl}/files/${id}/download?token=${encodeURIComponent(token)}`}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={14} />
              {file.original_name || file.name || `Tệp #${id}`}
            </a>
          );
        })}
      </div>
    );
  }
  if (field.type === 'table') {
    return <ProposalTableFieldValue record={record} field={field} />;
  }
  const parsed = parseValue(value);
  if (parsed && typeof parsed === 'object') {
    return <pre className="whitespace-pre-wrap break-words text-sm">{displayValue(parsed)}</pre>;
  }
  return <span className="whitespace-pre-wrap break-words">{displayValue(parsed)}</span>;
};

const AdminProposalGradingDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scoreOpen, setScoreOpen] = useState(false);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [supplementReason, setSupplementReason] = useState('');
  const [savingSupplement, setSavingSupplement] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState('');
  const [supplementError, setSupplementError] = useState('');
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState('success');
  const [fileViewing, setFileViewing] = useState(null);
  const [draftConfig, setDraftConfig] = useState({ grading: [], regrading: [] });
  const [configStep, setConfigStep] = useState('grading');

  const loadDetail = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError('');
    try {
      const response = await proposalGradingService.getDetail(id, token);
      const result = response?.data || response;
      setDetail(result);
      const allKeys = (result?.fieldDefinitions || []).map((field) => field.key);
      const config = result?.displayConfig || {};
      setConfigStep(getStep(result?.proposal, result?.permissions));
      setDraftConfig({
        grading: Array.isArray(config.grading) ? config.grading : allKeys,
        regrading: Array.isArray(config.regrading) ? config.regrading : allKeys
      });
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
  const step = getStep(proposal, detail?.permissions);
  const fields = useMemo(() => {
    const keys = new Set(draftConfig[step] || []);
    return (detail?.fieldDefinitions || [])
      .filter((field) => field.status !== 'inactive'
        && keys.has(field.key)
        && !PROPOSAL_PROCESS_FIELD_KEYS.includes(field.key)
        && isProposalFieldForModel(field.key, proposal))
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  }, [detail, draftConfig, step]);
  const canGradeQH = !!detail?.permissions?.canGradeQH;
  const canGradePL = !!detail?.permissions?.canGradePL;
  const canRequestSupplement = !!detail?.permissions?.canRequestSupplement;

  const handleScoreSaved = async (result, message) => {
    setScoreOpen(false);
    const transition = result?.transition;
    const extra = transition?.status === 'CANCELLED'
      ? ' — Đề xuất bị hủy vì có điểm 0'
      : transition?.status === 'DESIGNING'
        ? ' — Đề xuất chuyển sang Đang vẽ Layout'
        : transition?.status === 'GDTTKD_EVALUATING'
          ? ' — Đề xuất chuyển sang GĐTTKD đánh giá'
          : result?.transitionError ? ` — ${result.transitionError}` : '';
    setToast((message || 'Đã cập nhật điểm') + extra);
    setToastType(result?.transitionError || result?.reviewRequestError ? 'warning' : 'success');
    await loadDetail();
  };

  const submitSupplement = async () => {
    setSavingSupplement(true);
    setSupplementError('');
    try {
      const response = await proposalGradingService.requestSupplement(
        proposal.id,
        { reason: supplementReason.trim() },
        token
      );
      setSupplementOpen(false);
      setSupplementReason('');
      setToast(response?.message || 'Đã gửi yêu cầu bổ sung thông tin');
      setToastType('success');
      await loadDetail();
    } catch (submitError) {
      setSupplementError(submitError?.message || 'Không gửi được yêu cầu bổ sung');
    } finally {
      setSavingSupplement(false);
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    setConfigError('');
    try {
      const response = await proposalGradingService.saveDisplayConfig(draftConfig, token);
      const config = response?.data || draftConfig;
      setDraftConfig(config);
      setToast('Đã lưu cấu hình hiển thị');
      setToastType('success');
    } catch (saveError) {
      setConfigError(saveError?.message || 'Không lưu được cấu hình');
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleField = (fieldKey) => {
    setDraftConfig((current) => {
      const selected = new Set(current[configStep] || []);
      if (selected.has(fieldKey)) selected.delete(fieldKey);
      else selected.add(fieldKey);
      return { ...current, [configStep]: [...selected] };
    });
  };

  if (loading) {
    return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg" /></div>;
  }
  if (error && !proposal) {
    return <div className="alert alert-error">{error}</div>;
  }
  if (!proposal) return null;

  const statusLabel = proposal.status === 'GRADING'
    ? 'Đang chấm điểm'
    : proposal.status === 'RE_GRADING'
      ? 'Đang chờ chấm điểm lại'
      : proposal.status;
  const scoreStatus = proposal.status === 'CANCELLED'
    || proposal.quy_hoach_score === 0
    || proposal.phap_ly_score === 0
    ? 'Đã hủy'
    : proposal.quy_hoach_score !== null && proposal.quy_hoach_score !== undefined
      && proposal.phap_ly_score !== null && proposal.phap_ly_score !== undefined
      && !proposal.quy_hoach_regrade_request_id && !proposal.phap_ly_regrade_request_id
        ? 'Đã hoàn thành'
        : 'Đang làm';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Quay lại
        </button>
        <div className="flex flex-wrap gap-2">
          <ProposalLocationMapButton proposal={proposal} />
          {detail.permissions?.canConfigure && (
            <button type="button" className="btn btn-primary btn-sm gap-1" onClick={saveConfig} disabled={savingConfig}>
              <Save size={15} /> {savingConfig ? 'Đang lưu...' : 'Lưu cấu hình hiển thị'}
            </button>
          )}
        </div>
      </div>

      <PageHeader title={`Chi tiết chấm điểm — ${proposal.ma_de_xuat || `#${proposal.id}`}`} />
      <ProposalProgressiveDetails
        record={proposal}
        progress={detail.progress}
        currentStep={1}
        onViewFile={setFileViewing}
        showSummary
      />
      <section className="card bg-base-100 border border-base-300">
        <div className="card-body p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="badge badge-info">{statusLabel}</span>
            <span className={`badge ${scoreStatus === 'Đã hủy' ? 'badge-error' : scoreStatus === 'Đã hoàn thành' ? 'badge-success' : 'badge-warning'}`}>
              {scoreStatus}
            </span>
            <span className="text-sm">Quy hoạch: {proposal.quy_hoach_regrade_request_id
              ? `Đang chờ Quy hoạch chấm lại${proposal.quy_hoach_score !== null ? ` (điểm trước: ${proposal.quy_hoach_score}/3)` : ''}`
              : proposal.quy_hoach_score ?? 'Chưa chấm'}</span>
            <span className="text-sm">Pháp lý: {proposal.phap_ly_regrade_request_id
              ? `Đang chờ Pháp lý chấm lại${proposal.phap_ly_score !== null ? ` (điểm trước: ${proposal.phap_ly_score}/3)` : ''}`
              : proposal.phap_ly_score ?? 'Chưa chấm'}</span>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {proposal.quy_hoach_regrade_description && (
              <div className="alert alert-warning py-2 text-sm">
                <span><b>Yêu cầu Quy hoạch chấm lại:</b> {proposal.quy_hoach_regrade_description}</span>
              </div>
            )}
            {proposal.phap_ly_regrade_description && (
              <div className="alert alert-warning py-2 text-sm">
                <span><b>Yêu cầu Pháp lý chấm lại:</b> {proposal.phap_ly_regrade_description}</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {canRequestSupplement && (
              <button type="button" className="btn btn-warning btn-sm" onClick={() => setSupplementOpen(true)}>
                Yêu cầu bổ sung thông tin
              </button>
            )}
            {(canGradeQH || canGradePL) && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setScoreOpen(true)}>
                {proposal.status === 'RE_GRADING' ? 'Chấm điểm lại' : 'Chấm điểm'}
              </button>
            )}
          </div>
        </div>
      </section>

      {detail.permissions?.canConfigure && (
        <section className="card bg-base-100 border border-info/40">
          <div className="card-body p-4">
            <h2 className="font-semibold">Cấu hình trường hiển thị</h2>
            <p className="text-sm text-base-content/60">Cấu hình này áp dụng riêng cho từng bước trên trang chi tiết chấm điểm.</p>
            <div role="tablist" className="tabs tabs-boxed w-fit">
              <button type="button" role="tab" className={`tab ${configStep === 'grading' ? 'tab-active' : ''}`} onClick={() => setConfigStep('grading')}>Chấm điểm lần đầu</button>
              <button type="button" role="tab" className={`tab ${configStep === 'regrading' ? 'tab-active' : ''}`} onClick={() => setConfigStep('regrading')}>Chấm điểm lại</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(detail.fieldDefinitions || []).filter((field) => field.status !== 'inactive').map((field) => (
                <label key={field.key} className="label justify-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={(draftConfig[configStep] || []).includes(field.key)}
                    onChange={() => toggleField(field.key)}
                  />
                  <span className="label-text">{field.label || field.key}</span>
                </label>
              ))}
            </div>
            {configError && <div className="alert alert-error py-2 text-sm">{configError}</div>}
          </div>
        </section>
      )}

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body p-4">
          <h2 className="font-semibold">Thông tin đề xuất</h2>
          {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className="rounded border border-base-300 p-3">
                <h3 className="text-xs font-semibold text-base-content/60 mb-1">{field.label || field.key}</h3>
                <FieldValue field={field} record={proposal} value={proposal[field.key]} token={token} />
              </div>
            ))}
          </div>
          {fields.length === 0 && <p className="text-sm text-base-content/60">Không có trường nào được cấu hình hiển thị.</p>}
        </div>
      </section>

      <ProposalGradingModal
        open={scoreOpen}
        record={proposal}
        canGradeQH={canGradeQH}
        canGradePL={canGradePL}
        onClose={() => setScoreOpen(false)}
        onSaved={handleScoreSaved}
      />

      {supplementOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h2 className="font-bold text-lg">Yêu cầu bổ sung thông tin</h2>
            <p className="text-sm text-base-content/70 mt-1">Nêu rõ nội dung cần người đề xuất bổ sung.</p>
            <textarea
              className="textarea textarea-bordered w-full mt-3 min-h-28"
              value={supplementReason}
              onChange={(event) => setSupplementReason(event.target.value)}
              maxLength={5000}
              autoFocus
            />
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setSupplementOpen(false)} disabled={savingSupplement}>Hủy</button>
              <button
                type="button"
                className="btn btn-warning"
                onClick={submitSupplement}
                disabled={savingSupplement || supplementReason.trim().length < 3}
              >
                {savingSupplement ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
            </div>
            {supplementError && <div className="alert alert-error py-2 text-sm mt-3">{supplementError}</div>}
          </div>
          <form method="dialog" className="modal-backdrop" onClick={() => !savingSupplement && setSupplementOpen(false)}>
            <button type="button">close</button>
          </form>
        </dialog>
      )}
      {fileViewing && <FileViewer file={fileViewing} onClose={() => setFileViewing(null)} />}
      <Toast message={toast} type={toastType} onClose={() => setToast('')} />
    </div>
  );
};

export default AdminProposalGradingDetailPage;
