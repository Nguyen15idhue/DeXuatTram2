import { Pencil } from 'lucide-react';
import {
  formatScore,
  getGradingStatusLabel,
  getMissingLegalDocs,
  isLegalDocsComplete
} from '../../utils/proposalGrading';

const DepartmentCell = ({ score, note }) => (
  <td className="align-top">
    <div className="font-semibold">{formatScore(score)}</div>
    {note ? <div className="text-xs text-base-content/70 whitespace-pre-wrap">{note}</div> : null}
  </td>
);

const ProposalGradingSummary = ({ formData, record, canGradeQH = false, canGradePL = false, onUpdate }) => {
  const data = { ...(record || {}), ...(formData || {}) };
  if (!data || Object.keys(data).length === 0) return null;
  const complete = isLegalDocsComplete(data);
  const missing = getMissingLegalDocs(data);
  const canUpdate = (canGradeQH || canGradePL) && typeof onUpdate === 'function';

  return (
    <div className="border rounded-lg p-3 mb-3 bg-base-100">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm">Đánh giá Quy hoạch và Pháp lý</h3>
        {canUpdate && (
          <button
            type="button"
            className="btn btn-xs btn-outline btn-primary gap-1"
            onClick={onUpdate}
          >
            <Pencil size={12} />
            Cập nhật
          </button>
        )}
      </div>
      <table className="table table-xs">
        <thead>
          <tr>
            <th className="w-1/2">Quy hoạch</th>
            <th className="w-1/2">Pháp lý</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <DepartmentCell score={data.quy_hoach_score} note={data.quy_hoach_note || ''} />
            <DepartmentCell score={data.phap_ly_score} note={data.phap_ly_note || ''} />
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-base-content/70">
        Trạng thái chi tiết: <b>{getGradingStatusLabel(data.grading_status) || '—'}</b>
      </p>
      {!complete && (
        <p className="text-xs text-warning mt-1">
          Thiếu hồ sơ pháp lý: {missing.join(', ')}
        </p>
      )}
    </div>
  );
};

export default ProposalGradingSummary;
