import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Dialog } from '../ui';
import ChargingStationAcceptanceFields, { acceptancePayload } from './ChargingStationAcceptanceFields';
import { canOperateStation, requestKeyForIntent } from '../../utils/chargingFulfillment';

const ChargingStationAcceptanceModal = ({ station, portionId, onClose, onChanged }) => {
  const { token, user } = useAuth();
  const [record, setRecord] = useState(null);
  const [portion, setPortion] = useState(null);
  const [reports, setReports] = useState({});
  const [uploads, setUploads] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const request = useRef(null);
  useEffect(() => {
    let active = true;
    Promise.all([chargingStationService.getDetail(station.id, token), chargingStationService.getDeployments(station.id, token)])
      .then(([detail, deployments]) => {
        if (!active) return;
        if (!detail.success || !deployments.success) throw new Error(detail.message || deployments.message || 'Không tải được hồ sơ nghiệm thu');
        const row = deployments.data.find(item => Number(item.id) === Number(portionId));
        if (!row) throw new Error('Không tìm thấy phần trụ');
        setRecord(detail.data);
        setPortion(row);
        setReports(row.acceptance_reports || {});
      }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [station.id, portionId, token]);
  const canEdit = record && portion?.installation_status === 'DONE' && portion.acceptance_status !== 'PASSED'
    && !record.workflow_override?.completed && record.status !== 'CANCELLED' && canOperateStation(user, record, 'setup');
  const uploading = Object.values(uploads).some(Boolean);
  const save = async event => {
    event.preventDefault();
    if (saving.current || uploading) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const payload = { action: 'acceptance-passed', expected_version: portion.workflow_version, ...acceptancePayload(reports) };
      request.current = requestKeyForIntent(request.current, payload);
      const response = await chargingStationService.deploymentAction(station.id, portion.id, { ...payload, request_id: request.current.request_id }, token);
      if (!response.success) throw new Error(response.message || 'Không lưu được hồ sơ nghiệm thu');
      await onChanged?.();
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Dialog isOpen title="Nghiệm thu lắp đặt" size="xl" portal onClose={() => !busy && !uploading && onClose()}>
    <form className="space-y-4" onSubmit={save}>
      {loading && <span className="loading loading-spinner" />}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {portion && <>
        <p className="font-medium">Phiếu #{portion.export_id} · Phần #{portion.id} · {portion.pole_name} · {portion.supplier_name || '—'} · {portion.quantity} trụ</p>
        {Boolean(portion.acceptance_legacy) && <p className="text-warning">Hồ sơ nghiệm thu cũ được giữ nguyên; không tự tạo ảnh/tài liệu bổ sung.</p>}
        <ChargingStationAcceptanceFields value={reports} onChange={setReports} readOnly={!canEdit} disabled={busy}
          onUploadingChange={(key, value) => setUploads(current => ({ ...current, [key]: value }))} />
      </>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy || uploading} onClick={onClose}>Hủy</Button>
        {canEdit && <Button type="submit" disabled={busy || uploading || loading} loading={busy}>Lưu</Button>}
      </div>
    </form>
  </Dialog>;
};

export default ChargingStationAcceptanceModal;
