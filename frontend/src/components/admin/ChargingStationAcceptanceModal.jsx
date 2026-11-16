import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Dialog } from '../ui';
import ChargingStationAcceptanceFields, { acceptancePayload } from './ChargingStationAcceptanceFields';
import ChargingStationStepHistory from './ChargingStationStepHistory';
import { ACCEPTANCE_LABELS, canOperateStation, formatDeploymentScale, portionUnavailable, requestKeyForIntent } from '../../utils/chargingFulfillment';

const ACTIONS = { NOT: 'acceptance-reset', FAILED: 'acceptance-failed', PASSED: 'acceptance-passed' };

const ChargingStationAcceptanceModal = ({ station, portionId, portionIds, initialStatus, onClose, onChanged }) => {
  const { token, user } = useAuth();
  const [record, setRecord] = useState(null);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('NOT');
  const [reason, setReason] = useState('');
  const [reports, setReports] = useState({});
  const [uploads, setUploads] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const request = useRef(null);
  const idsKey = JSON.stringify(portionIds || [portionId]);
  useEffect(() => {
    let active = true;
    Promise.all([chargingStationService.getDetail(station.id, token), chargingStationService.getDeployments(station.id, token)])
      .then(([detail, deployments]) => {
        if (!active) return;
        if (!detail.success || !deployments.success) throw new Error(detail.message || deployments.message || 'Không tải được hồ sơ nghiệm thu');
        const ids = JSON.parse(idsKey).map(Number);
        const selected = deployments.data.filter(item => ids.includes(Number(item.id)));
        if (!selected.length || selected.length !== ids.length) throw new Error('Phần trụ đã thay đổi; hãy mở lại modal');
        if (new Set(selected.map(row => row.acceptance_status || 'NOT')).size > 1) throw new Error('Nhóm nghiệm thu đã đổi trạng thái; hãy mở lại modal');
        setRecord(detail.data);
        setRows(selected);
        setStatus(initialStatus || selected[0].acceptance_status || 'NOT');
        const initialReports = selected[0].acceptance_reports || {};
        setReports(selected.every(row => JSON.stringify(row.acceptance_reports || {}) === JSON.stringify(initialReports)) ? initialReports : {});
      }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [station.id, idsKey, initialStatus, token]);
  const canEdit = record && (!record.workflow_override?.completed || user?.role === 'SUPER_ADMIN')
    && record.status !== 'CANCELLED' && canOperateStation(user, record, 'setup');
  const eligible = rows.filter(row => !portionUnavailable(row)
    && (user?.role === 'SUPER_ADMIN' || row.installation_status === 'DONE'
      || status === 'NOT' || (status === 'FAILED' && row.acceptance_status === 'PASSED')));
  const blocked = rows.filter(row => !eligible.includes(row));
  const uploading = Object.values(uploads).some(Boolean);
  const save = async event => {
    event.preventDefault();
    if (saving.current || uploading) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      if (!eligible.length) throw new Error('Không có phần trụ đủ điều kiện cập nhật');
      if (status !== 'PASSED' && !reason.trim()) throw new Error('Bắt buộc nhập lý do/ghi chú');
      const payload = {
        action: ACTIONS[status], reason: reason.trim() || null,
        items: eligible.map(row => ({ id: Number(row.id), expected_version: row.workflow_version })),
        ...(status === 'PASSED' ? acceptancePayload(reports) : {})
      };
      request.current = requestKeyForIntent(request.current, payload);
      const response = await chargingStationService.updateAcceptance(station.id, { ...payload, request_id: request.current.request_id }, token);
      if (!response.success) throw new Error(response.message || 'Không lưu được hồ sơ nghiệm thu');
      await onChanged?.();
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Dialog isOpen title="Cập nhật trạng thái" size="2xl" portal onClose={() => !busy && !uploading && onClose()}>
    <form className="space-y-4" onSubmit={save}>
      {loading && <span className="loading loading-spinner" />}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {record?.fulfillment?.needs_review && <div role="alert" className="alert alert-warning">
        Dữ liệu trụ cần đối soát. {record.fulfillment.review_message || 'Cần kiểm tra bảng trụ chốt và các phiếu giao cũ.'}
      </div>}
      {record?.workflow_override?.completed && <div className="alert alert-info">
        Trạm đã hoàn tất bằng ghi đè; số liệu giao nhận và triển khai thực tế được giữ nguyên.
      </div>}
      {!!rows.length && <>
        <p className="font-medium">{formatDeploymentScale(rows)}</p>
        <label className="block text-sm">Trạng thái nghiệm thu
          <select aria-label="Trạng thái nghiệm thu" className="select select-bordered mt-1 w-full" value={status}
            disabled={!canEdit || busy || uploading} onChange={event => setStatus(event.target.value)}>
            {Object.entries(ACCEPTANCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm">Lý do / Ghi chú{status !== 'PASSED' ? ' *' : ''}
          <textarea aria-label="Lý do / Ghi chú" className="textarea textarea-bordered mt-1 w-full" maxLength={5000}
            required={status !== 'PASSED'} disabled={!canEdit || busy} value={reason} onChange={event => setReason(event.target.value)} />
        </label>
        <p className="text-sm">Sẽ cập nhật: {eligible.reduce((sum, row) => sum + Number(row.quantity), 0)} trụ.</p>
        {!!blocked.length && <div role="alert" className="alert alert-warning">Không cập nhật các phần chưa đủ điều kiện lắp đặt hoặc đang hoàn hàng:
          {' '}{formatDeploymentScale(blocked)}.</div>}
        {status === 'PASSED' && <section className="space-y-3">
          <h3 className="font-semibold">Nghiệm thu lắp đặt</h3>
          <p className="text-sm text-base-content/60">Một bộ hồ sơ dùng chung cho tất cả phần trụ đủ điều kiện trong nhóm.</p>
          <ChargingStationAcceptanceFields value={reports} onChange={setReports} readOnly={!canEdit} disabled={busy}
            onUploadingChange={(key, value) => setUploads(current => ({ ...current, [key]: value }))} />
        </section>}
      </>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy || uploading} onClick={onClose}>Hủy</Button>
        {canEdit && <Button type="submit" disabled={busy || uploading || loading || !eligible.length} loading={busy}>Lưu</Button>}
      </div>
    </form>
    <ChargingStationStepHistory stationId={station.id} step="nghiem-thu" />
  </Dialog>;
};

export default ChargingStationAcceptanceModal;
