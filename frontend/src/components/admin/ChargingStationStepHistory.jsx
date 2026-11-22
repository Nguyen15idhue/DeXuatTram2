import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Pagination } from '../ui';
import { CS_CONTRACT_LABELS, CS_FLOW_LABELS, CS_STATUS_LABELS, CS_SUB_STATUS_LABELS } from '../../utils/chargingStation';
import { ACCEPTANCE_LABELS, SHIPMENT_STATUS_LABELS } from '../../utils/chargingFulfillment';

const STATUS_FIELDS = {
  contract_status: ['Hợp đồng', CS_CONTRACT_LABELS],
  infra_power_status: ['Hạ tầng điện', CS_FLOW_LABELS],
  infra_site_status: ['Hạ tầng mặt bằng', CS_FLOW_LABELS],
  infra_delivery_confirmation: ['Xác nhận điều kiện đi trụ', {
    NOT_CONFIRMED: 'Chưa xác nhận', CONFIRMED: 'Đủ điều kiện đi trụ'
  }],
  installation_status: ['Lắp trụ', { NOT: 'Chưa lắp trụ', DOING: 'Đang lắp trụ', DONE: 'Đã lắp xong' }],
  acceptance_status: ['Nghiệm thu', ACCEPTANCE_LABELS],
  transport_status: ['Vận chuyển', SHIPMENT_STATUS_LABELS],
  integration_status: ['ON trạm', { NOT: 'Chưa tích hợp', DOING: 'Đang tích hợp', DONE: 'Đã tích hợp' }]
};
const ACTION_LABELS = {
  contract_completed: 'Đã ký hợp đồng', contract_note_updated: 'Cập nhật ghi chú hợp đồng',
  infrastructure_status_changed: 'Cập nhật hạ tầng',
  infrastructure_confirmation_changed: 'Xác nhận điều kiện đi trụ', shipment_created: 'Tạo chuyến giao',
  shipment_received: 'Nhận trụ', shipment_return_requested: 'Yêu cầu hoàn hàng',
  shipment_return_confirmed: 'Xác nhận hoàn hàng', shipment_failed: 'Giao hàng thất bại',
  early_delivery_requested: 'Đề xuất giao sớm', installation_started: 'Bắt đầu lắp đặt',
  installation_completed: 'Hoàn tất lắp đặt', portion_start_installation: 'Bắt đầu lắp đặt',
  portion_complete_installation: 'Hoàn tất lắp đặt', acceptance_passed: 'Nghiệm thu đạt',
  acceptance_failed: 'Nghiệm thu không đạt', portion_acceptance_passed: 'Nghiệm thu đạt',
  portion_acceptance_failed: 'Nghiệm thu không đạt', portion_acceptance_reset: 'Chưa nghiệm thu',
  portion_complete_configuration: 'Cập nhật ON trạm', configuration_completed: 'Hoàn tất ON trạm',
  manual_marked_active: 'Đánh dấu đã ON trạm', portion_documents_overridden: 'Điều chỉnh hồ sơ',
  delivery_completed_manually: 'Đã giao hàng thành công · Giao trực tiếp không đổi tồn kho'
};
const valueText = value => value == null || value === '' ? '—' : typeof value === 'object' ? 'Hồ sơ' : String(value);
const summary = entry => {
  const changes = entry.changed_fields || {};
  const lines = Object.entries(STATUS_FIELDS).filter(([key]) => changes[key]).map(([key, [label, labels]]) => {
    const change = changes[key];
    if (typeof change !== 'object') return `${label}: ${labels[change] || valueText(change)}`;
    return `${label}: ${labels[change.old] || valueText(change.old)} → ${labels[change.new] || valueText(change.new)}`;
  });
  if (changes.on_quantity) {
    const delta = Number(changes.on_quantity.new) - Number(changes.on_quantity.old);
    lines.push(`Số lượng ON: ${changes.on_quantity.old} → ${changes.on_quantity.new} (${delta > 0 ? '+' : ''}${delta} trụ)`);
  }
  if (entry.action === 'delivery_completed_manually') lines.push(ACTION_LABELS.delivery_completed_manually);
  if (!lines.length && (entry.from_status || entry.to_status)) {
    const labels = { ...CS_STATUS_LABELS, ...CS_SUB_STATUS_LABELS };
    lines.push(`${labels[entry.from_status] || valueText(entry.from_status)} → ${labels[entry.to_status] || valueText(entry.to_status)}`);
  }
  if (changes.reports) lines.push('Cập nhật hồ sơ nghiệm thu');
  return lines.length ? lines.join('\n') : ACTION_LABELS[entry.action] || entry.action;
};
const noteText = entry => {
  const changes = entry.changed_fields || {};
  const notes = [entry.reject_reason, ...Object.entries(changes)
    .filter(([key]) => key.endsWith('_note')).map(([, change]) => typeof change === 'object' && change ? change.new : change)]
    .filter(note => typeof note === 'string' && note.trim());
  return [...new Set(notes)].join('\n') || '—';
};
const dateText = entry => {
  const changes = entry.changed_fields || {};
  if (changes.on_event_date) return `${changes.on_event_kind === 'CORRECTION' ? 'Điều chỉnh' : 'ON'}: ${changes.on_event_date}`;
  return Object.entries(changes).filter(([key, value]) => key.endsWith('_date') && value?.new)
    .map(([, value]) => String(value.new).slice(0, 10)).join('\n') || '—';
};

const ChargingStationStepHistory = ({ stationId, step, refreshKey }) => {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const reload = useCallback(() => setRetry(value => value + 1), []);
  useEffect(() => { setPage(1); }, [stationId, step]);
  useEffect(() => {
    if (!stationId || !token) return;
    let active = true;
    setLoading(true);
    setError('');
    chargingStationService.getActivity(stationId, step, page, token).then(response => {
      if (!response.success || !Array.isArray(response.data)) throw new Error(response.message || 'Không tải được lịch sử trạng thái');
      if (active) { setRows(response.data); setPagination(response.pagination); }
    }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [stationId, step, page, token, refreshKey, retry]);
  if (!stationId) return null;
  return <section className="space-y-2 border-t border-base-300 pt-3" aria-label="Lịch sử thay đổi trạng thái">
    <h3 className="font-semibold">Lịch sử thay đổi trạng thái</h3>
    {error ? <div role="alert" className="alert alert-error">{error}<Button type="button" onClick={reload}>Tải lại</Button></div>
      : loading ? <span className="loading loading-spinner loading-sm" /> : <>
        <div className="overflow-x-auto">
          <table className="table table-xs">
            <thead><tr><th>Hạng mục / Đơn giao</th><th>Trạng thái / Số lượng</th><th>Ngày thực hiện</th><th>Lý do / Ghi chú</th><th>Người cập nhật</th><th>Thời gian</th></tr></thead>
            <tbody>{rows.map(entry => {
              const exportId = entry.export_id || entry.changed_fields?.export_id;
              return <tr key={entry.id}>
                <td className="whitespace-pre-wrap">{[entry.pole_name || entry.shipment_scale, entry.supplier_name,
                  exportId ? `Đơn giao #${exportId}` : null].filter(Boolean).join('\n') || 'Toàn trạm'}</td>
                <td className="whitespace-pre-wrap">{summary(entry)}</td><td className="whitespace-pre-wrap">{dateText(entry)}</td>
                <td className="whitespace-pre-wrap break-words">{noteText(entry)}</td><td>{entry.actor_name || 'Hệ thống'}</td>
                <td>{new Date(entry.created_at).toLocaleString('vi-VN')}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {!rows.length && <p className="text-sm text-base-content/60">Chưa có lịch sử thay đổi của bước này.</p>}
        {pagination.totalPages > 1 && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </>}
  </section>;
};

export default ChargingStationStepHistory;
