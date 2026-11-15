import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Dialog } from '../ui';
import ChargingStationTable from './ChargingStationTable';
import ChargingStationAcceptanceModal from './ChargingStationAcceptanceModal';
import ChargingStationOnModal from './ChargingStationOnModal';
import { ACCEPTANCE_LABELS, INTEGRATION_LABELS, groupDeployments } from '../../utils/chargingFulfillment';

const ChargingStationGroupedProgress = ({ station, stage, onClose, onChanged }) => {
  const { token } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const acceptance = stage === 'nghiem-thu';
  const load = useCallback(async (autoOpen = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await chargingStationService.getDeployments(station.id, token);
      if (!response.success) throw new Error(response.message || 'Không tải được tiến độ các phần trụ');
      const next = groupDeployments(response.data || [], stage);
      setGroups(next);
      if (autoOpen && next.length === 1) setSelected(next[0]);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [station.id, stage, token]);
  useEffect(() => { load(true); }, [load]);
  const closeGroup = () => {
    if (groups.length === 1) { onClose(); return; }
    setSelected(null);
    load();
  };
  if (selected) {
    const props = { station, portionIds: selected.rows.map(row => row.id), onClose: closeGroup, onChanged };
    return acceptance ? <ChargingStationAcceptanceModal {...props} /> : <ChargingStationOnModal {...props} />;
  }
  return <Dialog isOpen portal size="xl" title={`${acceptance ? 'Triển khai nghiệm thu' : 'Triển khai ON trạm'} · ${station.ma_tram || ''}`} onClose={onClose}>
    <div className="space-y-4">
      {error && <div role="alert" className="alert alert-error">{error}<Button onClick={() => load(true)}>Tải lại</Button></div>}
      {station.fulfillment?.needs_review && <div role="alert" className="alert alert-warning">
        Dữ liệu trụ cần đối soát. {station.fulfillment.review_message || 'Cần kiểm tra bảng trụ chốt và các phiếu giao cũ.'}
      </div>}
      {station.workflow_override?.completed && <div className="alert alert-info">
        Trạm đã hoàn tất bằng ghi đè; số liệu giao nhận và triển khai thực tế được giữ nguyên.
      </div>}
      <ChargingStationTable loading={loading} frozenColumns={0} data={groups} emptyMessage="Chưa có phần trụ đã nhận để triển khai."
        columns={[
          { key: 'scale', label: 'Loại trụ', width: 420 },
          { key: 'quantity', label: 'Số lượng trụ' },
          { key: 'status', label: 'Trạng thái', width: 240, render: (value, row) => <button type="button"
            className={`badge cursor-pointer gap-1 ${['PASSED', 'DONE'].includes(value) ? 'badge-success' : value === 'FAILED' ? 'badge-error' : 'badge-ghost'}`}
            onClick={() => setSelected(row)}>
            {(acceptance ? ACCEPTANCE_LABELS : INTEGRATION_LABELS)[value]} <span aria-hidden>▾</span>
          </button> }
        ]} />
    </div>
  </Dialog>;
};

export default ChargingStationGroupedProgress;
