import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Dialog, Loading } from '../ui';

const ChargingStationCommitmentDialog = ({ station, onClose, onSaved }) => {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await chargingStationService.getCommitments(station.id, token);
      setData(response.data);
      setRows(response.data.rows);
    } catch (cause) { setError(cause.message || 'Không tải được trụ chốt'); }
    finally { setLoading(false); }
  }, [station.id, token]);
  useEffect(() => { load(); }, [load]);
  const change = (index, key, value) => setRows(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await chargingStationService.updateCommitments(station.id, {
        rows: rows.map(({ source_key, mo_hinh, pole_id, so_luong }) => ({ source_key, mo_hinh, pole_id, so_luong })),
        reason, expected_token: data.token
      }, token);
      onSaved();
    } catch (cause) { setError(cause.message || 'Không lưu được trụ chốt'); }
    finally { setSaving(false); }
  };
  return <Dialog isOpen title={`Cập nhật trụ chốt — ${station.ma_tram || `#${station.id}`}`} size="lg"
    onClose={() => { if (!saving) onClose(); }}>
    <div className="space-y-4">
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {loading ? <Loading message="Đang tải trụ chốt..." /> : data && <>
        {data.from_proposal && <p className="text-sm">Chưa có trụ chốt; các dòng dưới đây lấy từ quy mô đề xuất và chỉ được ghi khi lưu.</p>}
        {data.needs_review && <p className="text-sm text-warning">Hồ sơ đang được đánh dấu cần đối soát giao trụ. Lưu trụ chốt không tự xóa cảnh báo này.</p>}
        <p className="text-sm">Không thể xóa hoặc đổi loại/mô hình dòng đã có chứng từ; số lượng tối thiểu là đã xuất trừ phần đã hoàn.</p>
        <div className="space-y-3">
          {rows.map((row, index) => <div key={row.source_key || index} className="grid gap-2 rounded border border-base-300 p-3 md:grid-cols-4">
            <label className="text-sm">Mô hình
              <select aria-label={`Mô hình dòng ${index + 1}`} className="select select-bordered w-full" value={row.mo_hinh}
                disabled={saving || row.has_evidence} onChange={event => change(index, 'mo_hinh', event.target.value)}>
                <option value="">Chọn mô hình</option>
                <option value="TDT">Tự đầu tư</option><option value="NQ">Nhượng quyền</option><option value="LK">Liên kết</option>
              </select>
            </label>
            <label className="text-sm">Loại trụ
              <select aria-label={`Loại trụ dòng ${index + 1}`} className="select select-bordered w-full" value={row.pole_id || ''}
                disabled={saving || row.has_evidence} onChange={event => change(index, 'pole_id', event.target.value)}>
                <option value="">Chọn loại trụ{row.loai_tru ? ` (${row.loai_tru})` : ''}</option>
                {row.pole_id && !data.poles.some(p => Number(p.id) === Number(row.pole_id)) &&
                  <option value={row.pole_id}>{row.loai_tru}</option>}
                {data.poles.map(pole => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Số lượng (tối thiểu {Math.max(1, row.min_quantity || 0)})
              <input aria-label={`Số lượng dòng ${index + 1}`} className="input input-bordered w-full" type="number" step="1"
                min={Math.max(1, row.min_quantity || 0)} value={row.so_luong} disabled={saving}
                onChange={event => change(index, 'so_luong', event.target.value)} />
            </label>
            <div className="flex items-end"><Button variant="ghost" disabled={saving || row.has_evidence}
              onClick={() => setRows(current => current.filter((_, i) => i !== index))}>Xóa dòng</Button></div>
          </div>)}
        </div>
        <Button variant="outline" disabled={saving || rows.length >= 50} onClick={() => setRows(current => [...current, {
          source_key: null, mo_hinh: '', pole_id: '', so_luong: 1, min_quantity: 0, has_evidence: false
        }])}>Thêm dòng</Button>
        <label className="block text-sm">Lý do cập nhật *
          <textarea aria-label="Lý do cập nhật" className="textarea textarea-bordered mt-1 w-full" value={reason} maxLength={5000}
            disabled={saving} onChange={event => setReason(event.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={saving} onClick={load}>Tải lại</Button>
          <Button variant="ghost" disabled={saving} onClick={onClose}>Hủy</Button>
          <Button loading={saving} disabled={saving || !rows.length || reason.trim().length < 3} onClick={save}>Lưu</Button>
        </div>
      </>}
      {!loading && !data && <Button onClick={load}>Thử lại</Button>}
    </div>
  </Dialog>;
};

export default ChargingStationCommitmentDialog;
