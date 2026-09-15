import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { usageLabel, usageBadge } from './ViewPickerMenu';

const ImportViewPanel = ({ detection, views, value, onChange, loading }) => {
  if (!detection) return null;

  const unmatched = detection.unmatchedFileColumns || [];
  const omitted = detection.omittedFields || [];
  const omittedRequired = omitted.filter(f => f.required);
  const tone = !detection.confident ? 'alert-error' : ((unmatched.length > 0 || omitted.length > 0) ? 'alert-warning' : 'alert-success');

  return (
    <div className={`alert ${tone}`}>
      <div className="w-full">
        <div className="flex items-center gap-2 flex-wrap">
          {detection.confident ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span className="font-medium">
            {detection.source === 'override' ? 'Bộ cột đã chọn:' : 'Nhận diện tự động:'}
          </span>
          <span className={`badge badge-sm ${usageBadge(detection.detectedUsage)}`}>
            {usageLabel(detection.detectedUsage)}
          </span>
          <span>{detection.detectedViewName}</span>
          <span className="text-xs opacity-70">(khớp {Math.round((detection.score || 0) * 100)}%)</span>
        </div>

        {!detection.confident && (
          <p className="text-sm mt-1">Không nhận diện được bộ cột — chọn thủ công bên dưới.</p>
        )}
        {omitted.length > 0 && (
          <p className="text-sm mt-1">
            File thiếu {omitted.length} trường — sẽ để trống: {omitted.slice(0, 5).map(f => f.label).join(', ')}
            {omitted.length > 5 ? '…' : ''}
            {omittedRequired.length > 0 && <> (<b>{omittedRequired.length} trường bắt buộc</b>: {omittedRequired.slice(0, 3).map(f => f.label).join(', ')}{omittedRequired.length > 3 ? '…' : ''})</>}
            . Bổ sung sau bằng cách sửa đề xuất.
          </p>
        )}
        {unmatched.length > 0 && (
          <p className="text-sm mt-1">
            {unmatched.length} cột trong file không thuộc bộ đã chọn — sẽ bị bỏ qua: {unmatched.slice(0, 5).join(', ')}{unmatched.length > 5 ? '…' : ''}
          </p>
        )}

        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs">Đổi bộ cột:</span>
          <select
            className="select select-bordered select-xs"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={loading}
          >
            <option value="">Tự nhận diện theo file</option>
            {views.map(v => (
              <option key={v.id} value={v.id}>{usageLabel(v.usage)} – {v.name}</option>
            ))}
          </select>
          {loading && <span className="loading loading-spinner loading-xs"></span>}
        </div>
      </div>
    </div>
  );
};

export default ImportViewPanel;
