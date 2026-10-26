import {
  CheckCircle2,
  Circle,
  FileText,
  LayoutTemplate,
  Paperclip
} from 'lucide-react';
import ProposalGradingSummary from './ProposalGradingSummary';
import {
  getLegalDocs,
  getModelLabel,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone,
  formatProposalCost,
  formatProposedScale
} from '../../utils/proposalGrading';
import { getLayoutFiles } from '../../utils/proposalDesign';
import { getReportFiles } from '../../utils/proposalReport';
import {
  getProposalCurrentStep,
  getProposalEventStep,
  getProposalReachedStep,
  getProposalRequestStep,
  getProposalStatusLabel,
  PROPOSAL_ACTION_LABELS,
  PROPOSAL_PROCESS_STEPS,
  PROPOSAL_REQUEST_LABELS
} from '../../utils/proposalProgress';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'object') return value.label || value.name || value.full_name || JSON.stringify(value);
  return String(value);
};

const parseRows = (value) => {
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
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('vi-VN')} ₫` : '—';
};

const formatChangedFields = (value) => {
  let fields = value;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields);
    } catch {
      return [];
    }
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return [];
  return Object.entries(fields).map(([key, change]) => {
    if (!change || typeof change !== 'object') return `${key}: ${formatValue(change)}`;
    const label = change.label || key;
    if (!('old' in change) && !('new' in change)) return label;
    return `${label}: ${formatValue(change.old)} → ${formatValue(change.new)}`;
  });
};

const Section = ({ title, children }) => (
  <section className="rounded-lg border border-base-300 bg-base-100 p-4 space-y-3">
    <h2 className="font-semibold text-sm">{title}</h2>
    {children}
  </section>
);

const ProposalSummary = ({ record }) => (
  <Section title="Thông tin đề xuất">
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryItem label="Mã đề xuất" value={record?.ma_de_xuat || `#${record?.id || '—'}`} />
      <SummaryItem label="Người đề xuất" value={record?.user_name || record?.owner_name || (record?.user_id ? `#${record.user_id}` : 'Khách')} />
      <SummaryItem label="Tên pháp nhân" value={getProposalLegalName(record)} />
      <SummaryItem label="SĐT liên hệ" value={getProposalPhone(record)} />
      <SummaryItem label="Mô hình đầu tư" value={getModelLabel(record?.mo_hinh_dau_tu)} />
      <SummaryItem label="Miền / tỉnh" value={[formatValue(record?.vung_mien), formatValue(record?.province)].filter((value) => value !== '—').join(' · ')} />
      <SummaryItem label="Địa chỉ" value={getProposalAddress(record)} />
      <SummaryItem label="Quy mô trụ đề xuất" value={formatProposedScale(record)} />
      <SummaryItem label="Tổng chi phí dự kiến" value={formatProposalCost(record)} />
      <SummaryItem label="Người phụ trách" value={record?.nguoi_phu_trach?.label || record?.manager_name} />
      <SummaryItem label="Ngày tạo" value={formatDate(record?.created_at)} />
    </dl>
  </Section>
);

const SummaryItem = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs text-base-content/60">{label}</dt>
    <dd className="mt-1 break-words text-sm font-medium">{value || '—'}</dd>
  </div>
);

const FileLinks = ({ files, onViewFile, emptyText = 'Chưa có tệp' }) => {
  if (!files?.length) return <p className="text-sm text-base-content/60">{emptyText}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file, index) => (
        <button
          key={`${file.id || file.name || 'file'}-${index}`}
          type="button"
          className="btn btn-ghost btn-xs gap-1"
          onClick={() => onViewFile?.({
            id: file.id || file.file_id,
            original_name: file.name || file.original_name,
            mime_type: file.mime_type
          })}
          disabled={!onViewFile}
        >
          <Paperclip size={12} />
          {file.name || file.original_name || `Tệp #${file.id || file.file_id}`}
        </button>
      ))}
    </div>
  );
};

const ProgressStepper = ({ proposal, progress, reachedStep, currentStep, showNotes }) => {
  const paused = proposal?.status === 'PAUSED';
  const cancelled = proposal?.status === 'CANCELLED';
  const pauseEvent = [...(progress?.activity || [])].reverse().find((event) => event.to_status === 'PAUSED');
  return (
    <Section title="Tiến trình đề xuất">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PROPOSAL_PROCESS_STEPS.map((step) => {
          const reached = step.id <= reachedStep;
          const active = step.id === currentStep;
          return (
            <div
              key={step.key}
              className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
                active ? 'border-primary bg-primary/5' : reached ? 'border-success/40' : 'border-base-300'
              }`}
            >
              {reached ? (
                <CheckCircle2 size={16} className={active ? 'text-primary' : 'text-success'} />
              ) : (
                <Circle size={16} className="text-base-content/30" />
              )}
              <span className={active ? 'font-semibold' : ''}>{step.id}. {step.label}</span>
              {active && paused && <span className="badge badge-warning badge-xs">Tạm dừng</span>}
              {active && cancelled && <span className="badge badge-error badge-xs">Đã hủy</span>}
              {active && !paused && !cancelled && <span className="badge badge-primary badge-xs">Hiện tại</span>}
            </div>
          );
        })}
      </div>
      {proposal?.status && (
        <p className="text-xs text-base-content/60">
          Trạng thái: <span className="font-medium">{getProposalStatusLabel(proposal.status)}</span>
          {paused && proposal.paused_from_status && (
            <> · Tạm dừng từ bước “{getProposalStatusLabel(proposal.paused_from_status)}”</>
          )}
          {paused && proposal.paused_at && <> · Tạm dừng lúc {formatDate(proposal.paused_at)}</>}
          {paused && pauseEvent?.reason && <> · Lý do: {pauseEvent.reason}</>}
          {cancelled && reachedStep === 0 && (
            <> · Đề xuất thuộc quy trình cũ hoặc chưa có dữ liệu bước v2</>
          )}
          {reachedStep === 0 && !paused && !cancelled && (
            <> · Đề xuất đang ở luồng cũ hoặc chưa bắt đầu quy trình v2</>
          )}
        </p>
      )}
      {showNotes && (proposal?.note || proposal?.reject_reason) && (
        <div className="space-y-1 text-sm">
          {proposal.note && <p className="whitespace-pre-wrap"><span className="font-medium">Ghi chú:</span> {proposal.note}</p>}
          {proposal.reject_reason && <p className="whitespace-pre-wrap"><span className="font-medium">Lý do từ chối / hủy:</span> {proposal.reject_reason}</p>}
        </div>
      )}
    </Section>
  );
};

const StepResult = ({ step, record, onViewFile, signers }) => {
  const layoutFiles = getLayoutFiles(record);
  const reportFiles = getReportFiles(record);
  const chotRows = parseRows(record?.chot_so_luong_tru);
  const legalDocs = getLegalDocs(record);

  if (step.key === 'grading') {
    return (
      <div className="space-y-3">
        <ProposalGradingSummary record={record} />
        <div className="grid gap-2 sm:grid-cols-2">
          {legalDocs.map((doc) => (
            <div key={doc.key} className="rounded border border-base-200 p-3">
              <p className="text-xs font-semibold">{doc.label}</p>
              <p className={`text-xs mt-1 ${doc.has_file ? 'text-success' : 'text-warning'}`}>
                {doc.has_file ? 'Đã có hồ sơ' : 'Chưa có hồ sơ'}
              </p>
              <FileLinks files={doc.files} onViewFile={onViewFile} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step.key === 'review') {
    return (
      <div className="space-y-2">
        <p className="text-sm">
          Mức độ xem xét: <span className="font-medium">{record?.review_level ? `Mức ${record.review_level}` : 'Chưa phát sinh'}</span>
        </p>
      </div>
    );
  }

  if (step.key === 'layout') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium"><LayoutTemplate size={15} /> Bản vẽ layout hiện hành</div>
        <FileLinks files={layoutFiles} onViewFile={onViewFile} />
      </div>
    );
  }

  if (step.key === 'report') {
    return (
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium mb-1"><FileText size={15} /> Tờ trình BCĐX hiện hành</div>
          <FileLinks files={reportFiles} onViewFile={onViewFile} />
        </div>
        {chotRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table table-xs">
              <thead><tr><th>Mô hình</th><th className="text-right">Số lượng</th><th>Loại trụ</th><th className="text-right">Giá chốt</th><th className="text-right">Thành tiền</th></tr></thead>
              <tbody>
                {chotRows.map((row, index) => (
                  <tr key={`${row.mo_hinh || 'model'}-${index}`}>
                    <td>{row.mo_hinh || '—'}</td>
                    <td className="text-right">{Number(row.so_luong) || 0}</td>
                    <td>{row.loai_tru || '—'}</td>
                    <td className="text-right">{formatCurrency(row.gia_chot)}</td>
                    <td className="text-right">{formatCurrency(row.thanh_tien ?? (Number(row.so_luong) * Number(row.gia_chot)))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan={4} className="text-right">Tổng giá trị chốt</th><th className="text-right">{formatCurrency(record?.tong_gia_tri_chot)}</th></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (step.key === 'approval') {
    const signerCount = Number(record?.signer_count || record?.signer_total || signers?.length || 0);
    return (
      <div className="space-y-2">
        {signerCount > 0 && <p className="text-sm">Đã cấu hình {signerCount} người ký.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <FileLinks
        files={record?.signed_file_id ? [{ id: record.signed_file_id, name: 'BCĐX đã ký' }] : []}
        onViewFile={onViewFile}
        emptyText="Chưa có file BCĐX đã ký."
      />
      {signers?.length > 0 && (
        <ul className="divide-y divide-base-200">
          {signers.map((signer) => (
            <li key={signer.id} className="py-2 flex justify-between gap-2 text-sm">
              <span>{signer.full_name || `#${signer.user_id}`} · {signer.signer_title || 'Người ký'}</span>
              <span className="text-xs text-base-content/60">
                {signer.status === 'SIGNED' ? `Đã ký · ${formatDate(signer.signed_at)}` : 'Chờ ký'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const RequestHistory = ({ requests }) => {
  if (!requests.length) return <p className="text-sm text-base-content/60">Chưa có yêu cầu trong các bước này.</p>;
  return (
    <ol className="space-y-3">
      {requests.map((request) => (
        <li key={request.id} className="rounded-lg border border-base-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">{PROPOSAL_REQUEST_LABELS[request.request_type] || request.request_type}</strong>
            <span className={`badge badge-sm ${request.status === 'OPEN' ? 'badge-warning' : request.status === 'DONE' ? 'badge-success' : 'badge-ghost'}`}>
              {request.status === 'OPEN' ? 'Đang mở' : request.status === 'DONE' ? 'Đã hoàn thành' : 'Đã đóng'}
            </span>
          </div>
          {request.round_no && <p className="mt-1 text-xs text-base-content/60">Lần {request.round_no}</p>}
          {request.description && <p className="mt-2 text-sm whitespace-pre-wrap">{request.description}</p>}
          <p className="mt-2 text-xs text-base-content/60">
            Yêu cầu bởi {request.requested_by_name || request.requester_name || 'Hệ thống'}
            {request.target_title || request.target_department ? ` · Giao cho ${request.target_title || request.target_department}` : ''}
            {` · ${formatDate(request.created_at)}`}
          </p>
          {request.resolution_note && (
            <p className="mt-2 text-sm"><span className="font-medium">Kết quả:</span> {request.resolution_note}</p>
          )}
          {request.resolved_at && (
            <p className="mt-1 text-xs text-base-content/60">
              Hoàn thành bởi {request.resolved_by_name || '—'} · {formatDate(request.resolved_at)}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
};

const ActivityHistory = ({ events }) => {
  if (!events.length) return <p className="text-sm text-base-content/60">Chưa có hoạt động được ghi nhận.</p>;
  return (
    <details className="rounded-lg border border-base-200">
      <summary className="cursor-pointer p-3 text-sm font-medium">
        Xem {events.length} hoạt động đã ghi nhận
      </summary>
      <div className="px-3 pb-3">
        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="border-l-2 border-primary/30 pl-3">
              <p className="text-sm font-medium">{PROPOSAL_ACTION_LABELS[event.action] || event.action || 'Cập nhật'}</p>
              <p className="text-xs text-base-content/60">{event.actor_name || 'Hệ thống'} · {formatDate(event.created_at)}</p>
              {(event.from_status || event.to_status) && (
                <p className="text-sm">{getProposalStatusLabel(event.from_status)} → {getProposalStatusLabel(event.to_status)}</p>
              )}
              {event.reason && <p className="mt-1 text-sm whitespace-pre-wrap">{event.reason}</p>}
              {formatChangedFields(event.changed_fields).map((change) => (
                <p key={change} className="mt-1 text-xs text-base-content/70">{change}</p>
              ))}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
};

const ProposalProgressiveDetails = ({
  record,
  progress,
  currentStep,
  onViewFile,
  showStepDetails = true,
  showHistory = false,
  showSummary = false,
  showNotes = true,
  omitStepDetails = [],
  signers = []
}) => {
  const activity = progress?.activity || [];
  const requests = progress?.requests || [];
  const reachedStep = getProposalReachedStep(record, progress);
  const effectiveCurrentStep = getProposalCurrentStep(record, activity) || reachedStep;
  const historyThrough = currentStep === 'all' ? reachedStep : Number(currentStep || reachedStep);
  const priorThrough = currentStep === 'all' ? reachedStep : Math.min(reachedStep, Math.max(0, historyThrough - 1));
  const omitted = new Set(omitStepDetails);
  const visibleRequests = requests.filter((request) => {
    const step = getProposalRequestStep(request);
    return step === 0 || step <= historyThrough;
  });
  const visibleEvents = activity.filter((event) => {
    const step = getProposalEventStep(event);
    return step === 0 || step <= historyThrough;
  });

  return (
    <div className="space-y-4">
      <ProgressStepper
        proposal={record}
        progress={progress}
        reachedStep={reachedStep}
        currentStep={effectiveCurrentStep}
        showNotes={showNotes}
      />

      {showSummary && <ProposalSummary record={record} />}

      {showStepDetails && priorThrough > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-base-content/70">
            Kết quả các bước trước
          </h2>
          {PROPOSAL_PROCESS_STEPS
            .filter((step) => step.id <= priorThrough && !omitted.has(step.key))
            .map((step) => (
              <Section key={step.key} title={`${step.id}. ${step.label}`}>
                <StepResult
                  step={step}
                  record={record}
                  onViewFile={onViewFile}
                  signers={signers}
                />
              </Section>
            ))}
        </div>
      )}

      {showHistory && (
        <div className="space-y-3">
          <Section title="Yêu cầu và lịch sử xử lý">
            <RequestHistory requests={visibleRequests} />
            <ActivityHistory events={visibleEvents} />
          </Section>
        </div>
      )}
    </div>
  );
};

export default ProposalProgressiveDetails;
