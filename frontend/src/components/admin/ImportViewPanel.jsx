import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { usageLabel, usageBadge } from './ViewPickerMenu';

export const ImportSheetsSummary = ({ sheets }) => {
  if (!sheets || sheets.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="table table-xs w-full">
        <thead>
          <tr><th>Sheet</th><th>Mô hình</th><th className="text-right">Tổng dòng</th><th className="text-right">Hợp lệ</th><th className="text-right">Lỗi</th></tr>
        </thead>
        <tbody>
          {sheets.map((s) => (
            <tr key={s.sheet}>
              <td>{s.sheet}</td>
              <td><span className="badge badge-xs badge-accent">{s.model}</span></td>
              <td className="text-right">{s.totalRows}</td>
              <td className="text-right text-success">{s.validRows}</td>
              <td className="text-right text-error">{s.errorRows}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs opacity-70 mt-1">Mô hình đầu tư tự gán theo tên sheet — không cần nhập cột Mô hình.</p>
    </div>
  );
};

const ImportViewPanel = ({ detection, views, value, onChange, loading, sheets }) => {
  if (!detection) return null;

  const unmatched = detection.unmatchedFileColumns || [];
  const omitted = detection.omittedFields || [];
  const omittedRequired = omitted.filter(f => f.required);
  const isByModel = detection.detectedUsage === 'by_model';
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
            disabled={loading || isByModel}
            title={isByModel ? 'File theo mô hình dùng bộ cột cố định theo tên sheet' : undefined}
          >
            <option value="">Tự nhận diện theo file</option>
            {views.map(v => (
              <option key={v.id} value={v.id}>{usageLabel(v.usage)} – {v.name}</option>
            ))}
          </select>
          {loading && <span className="loading loading-spinner loading-xs"></span>}
        </div>
        <ImportSheetsSummary sheets={sheets} />
      </div>
    </div>
  );
};

export default ImportViewPanel;
