import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api, chargingStationService } from '../../services/api';
import { Badge, Button, Dialog, Input } from '../ui';
import ChargingStationTable from './ChargingStationTable';
import FileViewer from '../dynamic/FileViewer';
import { CS_STATUS_LABELS, CS_SUB_STATUS_LABELS, formatCsDate } from '../../utils/chargingStation';
import {
  canOperateStation, deploymentActions, DEPLOYMENT_ACTION_LABELS, missingOnPrerequisites,
  shipmentAvailable, validateShipmentQuantities, requestKeyForIntent
} from '../../utils/chargingFulfillment';

const SHIPMENT_ACTIONS = {
  receive: 'Nhận một phần / toàn bộ',
  'request-return': 'Yêu cầu trả hàng',
  'confirm-return': 'Xác nhận hoàn kho thực tế',
  fail: 'Giao hàng thất bại'
};
const STAGE_NAMES = { SHIPPING: 'Đang vận chuyển', RECEIVED: 'Đã nhận', DELIVERED: 'Đã nhận', FAILED: 'Giao thất bại', RETURN_PENDING: 'Chờ hoàn kho', RETURNED: 'Đã hoàn kho' };

const ChargingStationFulfillment = ({ station, stage, onChanged }) => {
  const { token, user } = useAuth();
  const [record, setRecord] = useState(station);
  const [fulfillment, setFulfillment] = useState(station.fulfillment || {});
  const [portions, setPortions] = useState(station.deployments || []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState('');
  const [intent, setIntent] = useState(null);
  const [form, setForm] = useState({});
  const [quantities, setQuantities] = useState({});
  const [file, setFile] = useState(null);
  const [viewingFile, setViewingFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const request = useRef(null);
  const uploadedFile = useRef(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, summary, deployments] = await Promise.all([
        chargingStationService.getDetail(station.id, token),
        chargingStationService.getFulfillment(station.id, token),
        chargingStationService.getDeployments(station.id, token)
      ]);
      setRecord(detail.data);
      const currentPortions = Array.isArray(deployments.data) ? deployments.data : deployments.data?.items || [];
      setFulfillment({ ...summary.data, items: (summary.data?.items || []).map((item) => ({
        ...item, id: item.id || item.commitment_id, supplier: item.supplier || item.supplier_name
      })), shipments: (summary.data?.shipments || []).map((shipment) => ({
        ...shipment, items: (shipment.items || []).map((item) => {
          if (!currentPortions.some((portion) => Number(portion.export_item_id) === Number(item.id))) return item;
          const eligible = currentPortions.filter((portion) => portion.stage === 'INSTALLING'
            && Number(portion.export_item_id) === Number(item.id)).reduce((sum, portion) => sum + Number(portion.quantity), 0);
          return { ...item, returnable_quantity: Math.max(0, eligible - Number(item.return_pending_quantity || 0)) };
        })
      })) });
      setPortions(currentPortions);
      setLoadError(false);
      setError('');
    } catch (loadFailure) { setError(loadFailure.message); setLoadError(true); }
    finally { setLoading(false); }
  }, [station.id, token]);
  useEffect(() => { load(); }, [load]);
  const canShip = canOperateStation(user, record, 'back_office');
  const canSetup = canOperateStation(user, record, 'setup');
  const canRequest = canOperateStation(user, record, 'request_early') || user?.role === 'SUPER_ADMIN';
  const missing = missingOnPrerequisites(record);
  const showShipping = !stage || stage === 'giao-tru';
  const showPortions = !stage || stage !== 'giao-tru';
  const begin = (action, target) => {
    if (loading || loadError) return;
    setIntent({ action, target });
    request.current = null;
    uploadedFile.current = null;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setForm({ carrier: '', transport_code: '', total_amount: '', transport_status: 'SHIPPING',
      cms_station_code: record.cms_station_code || '', on_date: target?.on_date?.slice(0, 10) || today,
      reason: '', desired_date: '', acknowledged: false });
    const rows = action === 'export' ? fulfillment.items || [] : target?.items || [];
    setQuantities(Object.fromEntries(rows.map((row) => [row.id, action === 'export'
      ? Number(row.remaining_quantity || 0) : shipmentAvailable(row, action)])));
    setFile(null);
    setError('');
  };
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      let response;
      const { action, target } = intent;
      request.current = requestKeyForIntent(request.current, {
        action, target: target?.id, form, quantities, file: file ? [file.name, file.size, file.lastModified] : null
      });
      const { request_id } = request.current;
      if (['fail', 'request-return', 'acceptance-failed', 'early'].includes(action) && !form.reason.trim()) {
        throw new Error('Vui lòng nhập lý do');
      }
      if (action === 'export') {
        const items = validateShipmentQuantities(fulfillment.items || [], quantities, true);
        response = await chargingStationService.createShipment(record.id, {
          ...form, items, total_amount: Number(form.total_amount), request_id
        }, token);
      } else if (Object.hasOwn(SHIPMENT_ACTIONS, action)) {
        const items = action === 'fail' ? [] : validateShipmentQuantities(target.items || [], quantities, false, action);
        response = await chargingStationService.shipmentAction(record.id, target.id, action, { items, reason: form.reason, request_id }, token);
      } else if (action === 'early') {
        if (!form.desired_date || !form.acknowledged) throw new Error('Chọn ngày mong muốn và xác nhận cảnh báo giao sớm');
        response = await chargingStationService.requestEarlyDelivery(record.id, {
          desired_date: form.desired_date, desired_delivery_date: form.desired_date,
          reason: form.reason, accept_missing: true, request_id
        }, token);
      } else {
        let acceptanceFileId = target.acceptance_file_id;
        if (action === 'acceptance-passed') {
          if (file) {
            if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) throw new Error('Biên bản phải là PDF tối đa 10 MB');
            const fileKey = JSON.stringify([file.name, file.size, file.lastModified]);
            if (uploadedFile.current?.key !== fileKey) {
              const body = new FormData();
              body.append('file', file);
              const uploaded = await api.uploadWithAuth('/files/upload', body, token);
              if (!uploaded.success || !uploaded.data?.id) throw new Error(uploaded.message || 'Tải biên bản thất bại');
              uploadedFile.current = { key: fileKey, id: uploaded.data.id };
            }
            acceptanceFileId = uploadedFile.current.id;
          }
          if (!acceptanceFileId) throw new Error('Vui lòng tải biên bản nghiệm thu PDF cho phần trụ này');
        }
        if (action === 'complete-configuration') {
          if (!form.cms_station_code.trim() || !form.on_date) throw new Error('Nhập mã CMS và ngày ON');
          if (missing.length && (!form.acknowledged || !form.reason.trim())) throw new Error('Thiếu điều kiện: phải nhập lý do và xác nhận chấp nhận rủi ro');
        }
        response = await chargingStationService.deploymentAction(record.id, target.id, {
          action, request_id, reason: form.reason, acceptance_file_id: acceptanceFileId,
          cms_station_code: form.cms_station_code, on_date: form.on_date, accept_missing: !!form.acknowledged
        }, token);
      }
      if (response?.success === false) throw new Error(response.message || 'Thao tác thất bại');
      setIntent(null);
      await load();
      onChanged?.();
    } catch (actionError) { setError(actionError.message || 'Thao tác thất bại'); }
    finally { saving.current = false; setBusy(false); }
  };
  const rows = intent?.action === 'export' ? fulfillment.items || [] : intent?.target?.items || [];
  const quantityAction = intent?.action === 'export' || (intent?.action !== 'fail' && Object.hasOwn(SHIPMENT_ACTIONS, intent?.action || ''));
  const title = intent?.action === 'export' ? 'Tạo phiếu xuất kho' : intent?.action === 'early'
    ? 'Đề xuất giao trụ sớm' : SHIPMENT_ACTIONS[intent?.action] || DEPLOYMENT_ACTION_LABELS[intent?.action];
  return (
    <div className="space-y-4 text-sm">
      {error && <div role="alert" className="alert alert-error text-sm">{error}</div>}
      {loadError && <Button size="sm" variant="outline" onClick={load}>Tải lại dữ liệu trước khi thao tác</Button>}
      {loading && <span className="loading loading-spinner loading-sm" />}
      <div className="flex flex-wrap gap-2">
        {Object.entries({ committed: 'Chốt', exported: 'Đã xuất', received: 'Đã nhận', returned: 'Hoàn kho', in_transit: 'Đang giao', remaining: 'Chưa xuất', operating: 'Đã ON' }).map(([key, label]) => (
          <Badge key={key} variant={key === 'operating' ? 'success' : 'ghost'}>{label}: {fulfillment.totals?.[key] || 0}</Badge>
        ))}
      </div>
      {fulfillment.needs_review && <div className="alert alert-warning">Dữ liệu trụ cần đối soát. Không thay thế bằng thao tác ON toàn trạm.</div>}
      {showShipping && <>
        <h3 className="font-semibold">Chốt trụ và tồn kho</h3>
        <ChargingStationTable frozenColumns={0} emptyMessage="Không có dữ liệu" data={fulfillment.items || []} columns={[
          { key: 'name', label: 'Trụ', render: (value, row) => value || row.pole_name || `#${row.id}` },
          { key: 'model', label: 'Mô hình' }, { key: 'supplier', label: 'Nhà cung cấp' },
          { key: 'committed_quantity', label: 'Chốt' }, { key: 'stock_quantity', label: 'Tồn kho' },
          { key: 'exported_quantity', label: 'Đã xuất' }, { key: 'received_quantity', label: 'Đã nhận' },
          { key: 'returned_quantity', label: 'Hoàn kho' }, { key: 'in_transit_quantity', label: 'Đang giao' },
          { key: 'remaining_quantity', label: 'Chưa xuất' }, { key: 'operating_quantity', label: 'Đã ON' }
        ]} />
        <div className="flex gap-2">
          {canShip && <Button size="sm" onClick={() => begin('export')}>Xuất trụ theo số lượng</Button>}
          {canRequest && <Button size="sm" variant="outline-warning" onClick={() => begin('early')}>Đề xuất giao sớm</Button>}
          {!canShip && !canRequest && <span className="text-base-content/50">Chỉ xem</span>}
        </div>
        <h3 className="font-semibold">Lịch sử các chuyến giao</h3>
        {(fulfillment.shipments || []).map((shipment) => (
          <details key={shipment.id} className="rounded-lg border border-base-300 p-3" open>
            <summary className="cursor-pointer font-semibold">Phiếu #{shipment.id} · {shipment.carrier || '—'} · {shipment.transport_code || '—'} · {STAGE_NAMES[shipment.transport_status] || shipment.transport_status}</summary>
            <div className="mt-2 space-y-2">
              <span className="text-xs text-base-content/60">{shipment.created_at} · {Number(shipment.total_amount || 0).toLocaleString('vi-VN')} đ</span>
              {shipment.reason && <p className="text-xs">Lý do: {shipment.reason}</p>}
              <ChargingStationTable frozenColumns={0} emptyMessage="Không có dữ liệu" data={shipment.items || []} columns={[
                { key: 'name', label: 'Trụ', render: (value, item) => value || item.pole_name || `#${item.commitment_id}` },
                { key: 'quantity', label: 'Xuất' }, { key: 'received_quantity', label: 'Nhận' },
                { key: 'return_pending_quantity', label: 'Chờ hoàn' }, { key: 'returned_quantity', label: 'Đã hoàn' }
              ]} />
              {canShip && <div className="flex flex-wrap gap-2">{Object.entries(SHIPMENT_ACTIONS).map(([action, label]) => (
                <Button key={action} size="xs" variant="outline" disabled={action === 'fail'
                  ? ['DELIVERED', 'RETURNED'].includes(shipment.transport_status)
                  : !(shipment.items || []).some((item) => shipmentAvailable(item, action) > 0)} onClick={() => begin(action, shipment)}>{label}</Button>
              ))}</div>}
            </div>
          </details>
        ))}
      </>}
      {showPortions && <>
        <h3 className="font-semibold">Các phần trụ triển khai</h3>
        {!portions.length && !loading && <p className="text-base-content/50">Chưa có phần trụ đã nhận để triển khai.</p>}
        {portions.map((portion) => (
          <details key={portion.id} className="rounded-lg border border-base-300 p-3" open>
            <summary className="cursor-pointer font-semibold">Phần #{portion.id} · {portion.quantity} trụ · {CS_STATUS_LABELS[portion.stage] || portion.stage} / {CS_SUB_STATUS_LABELS[portion.sub_status] || portion.sub_status}</summary>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span>Ngày ON: {formatCsDate(portion.on_date)}</span>
              {portion.acceptance_file_id && <Button size="xs" variant="outline" onClick={() => setViewingFile({ id: portion.acceptance_file_id, original_name: portion.acceptance_file_name || 'Biên bản.pdf', mime_type: 'application/pdf' })}>Biên bản nghiệm thu</Button>}
              {canSetup && deploymentActions(portion).filter((action) => !stage
                || (stage === 'lap-tru' && action.includes('installation'))
                || (stage === 'nghiem-thu' && action.includes('acceptance'))
                || (stage === 'on-tram' && action === 'complete-configuration')).map((action) => (
                <Button key={action} size="xs" variant={action.endsWith('failed') ? 'outline-error' : 'primary'} onClick={() => begin(action, portion)}>{DEPLOYMENT_ACTION_LABELS[action]}</Button>
              ))}
              {!canSetup && <span className="text-base-content/50">Chỉ xem</span>}
            </div>
          </details>
        ))}
      </>}
      <Dialog isOpen={!!intent} title={title || ''} onClose={() => !busy && setIntent(null)} size="lg">
        {intent && <form onSubmit={submit} className="space-y-3">
          {quantityAction && rows.map((row) => (
            <Input key={row.id} type="number" min="0" step="1" label={`${row.name || row.pole_name || `Trụ #${row.id}`} · ${intent.action === 'export' ? `còn ${row.remaining_quantity}, tồn ${row.stock_quantity}` : `có thể xử lý ${shipmentAvailable(row, intent.action)}`}`}
              value={quantities[row.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [row.id]: event.target.value }))} />
          ))}
          {intent.action === 'export' && <>
            <Input label="Đơn vị vận chuyển" value={form.carrier} onChange={(event) => setField('carrier', event.target.value)} />
            <Input label="Mã vận đơn" value={form.transport_code} onChange={(event) => setField('transport_code', event.target.value)} />
            <Input label="Tổng tiền" min="0" type="number" value={form.total_amount} onChange={(event) => setField('total_amount', event.target.value)} />
          </>}
          {intent.action === 'early' && <Input label="Ngày giao mong muốn" type="date" required value={form.desired_date} onChange={(event) => setField('desired_date', event.target.value)} />}
          {intent.action === 'acceptance-passed' && <Input label="Biên bản nghiệm thu PDF cho phần trụ" type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0])} />}
          {intent.action === 'complete-configuration' && <>
            <Input label="Mã trạm CMS (dùng chung)" required readOnly={!!record.cms_station_code} value={form.cms_station_code} onChange={(event) => setField('cms_station_code', event.target.value)} />
            <Input label="Ngày ON của phần trụ này" type="date" required value={form.on_date} onChange={(event) => setField('on_date', event.target.value)} />
            {record.on_date && <p className="text-xs text-base-content/60">Ngày ON đầu tiên của trạm giữ nguyên: {formatCsDate(record.on_date)}</p>}
          </>}
          <Input label="Lý do / ghi chú" value={form.reason} onChange={(event) => setField('reason', event.target.value)} />
          {(intent.action === 'early' || (intent.action === 'complete-configuration' && missing.length > 0)) && (
            <div className="rounded-lg border border-warning p-3">
              <p className="mb-2 text-warning">Chưa hoàn thành: {missing.join(', ') || 'Điều kiện giao trụ'}. Giao sớm / ON thiếu điều kiện có rủi ro; các công việc còn thiếu vẫn phải thực hiện.</p>
              <label className="flex items-center gap-2"><input type="checkbox" className="checkbox checkbox-sm" checked={form.acknowledged} onChange={(event) => setField('acknowledged', event.target.checked)} /> Tôi xác nhận chấp nhận và chịu trách nhiệm</label>
            </div>
          )}
          {error && <div role="alert" className="text-error">{error}</div>}
          <Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận'}</Button>
        </form>}
      </Dialog>
      {viewingFile && <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} token={token} />}
    </div>
  );
};

export default ChargingStationFulfillment;
