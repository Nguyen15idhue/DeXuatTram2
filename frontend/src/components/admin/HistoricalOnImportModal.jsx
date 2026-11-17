import { useState } from 'react';
import Dialog from '../ui/Dialog';
import ConfirmDialog from '../ConfirmDialog';
import { historicalOnImportService } from '../../services/api';

const HistoricalOnImportModal = ({ isOpen, onClose, token, onImported }) => {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [proof, setProof] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setError('');
    setBusy(true);
    try {
      await historicalOnImportService.downloadTemplate(token);
    } catch (e) {
      setError(e.message || 'Không tải được file mẫu');
    } finally {
      setBusy(false);
    }
  };
  const preview = async () => {
    if (!file) return;
    setError('');
    setRows(null);
    setProof(null);
    setResult(null);
    setBusy(true);
    try {
      const response = await historicalOnImportService.preview(file, token);
      if (!response?.success) throw new Error(response?.message || 'Không kiểm tra được file');
      setRows(response.data.rows);
      setProof(response.data.proof || null);
    } catch (e) {
      setError(e.message || 'Không kiểm tra được file');
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!file || !proof || busy) return;
    setConfirmOpen(false);
    setError('');
    setBusy(true);
    try {
      const response = await historicalOnImportService.confirm(file, proof, token);
      if (!response?.success) throw new Error(response?.message || 'Không thể import dữ liệu');
      setResult(response.data);
      setProof(null);
      onImported?.();
    } catch (e) {
      setError(e.message || 'Không thể import dữ liệu');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={() => { if (!busy) onClose(); }} title="Import dữ liệu trạm cũ" size="full" portal>
      <div className="space-y-4">
        <div className="alert alert-warning text-sm">
          Kiểm tra kỹ dữ liệu trước khi xác nhận. Toàn bộ file được ghi trong một giao dịch; nếu có lỗi, không dòng nào được lưu.
        </div>
        <p className="text-sm">Mỗi dòng là một đề xuất/ON trạm. Nhập mã BCĐX, mã CMS nếu có và số lượng theo từng loại trụ. Khi kết quả yêu cầu chọn, điền ID vào file và kiểm tra lại.</p>
        <div className="flex flex-wrap gap-3 items-center">
          <button type="button" className="btn btn-outline btn-sm" onClick={download} disabled={busy}>Tải file mẫu</button>
          <input type="file" accept=".xlsx" className="file-input file-input-bordered file-input-sm" disabled={busy}
            onChange={event => { setFile(event.target.files?.[0] || null); setRows(null); setProof(null); setResult(null); setError(''); }} />
          <button type="button" className="btn btn-primary btn-sm" onClick={preview} disabled={!file || busy}>
            {busy ? 'Đang xử lý...' : 'Kiểm tra sơ bộ'}
          </button>
        </div>
        {error && <div role="alert" className="alert alert-error text-sm">{error}</div>}
        {result && <div role="status" className="alert alert-success text-sm">
          Đã import {result.rows.length} dòng: {result.rows.filter(row => row.action === 'create').length} tạo mới, {result.rows.filter(row => row.action === 'update').length} cập nhật.
        </div>}
        {rows && (
          <div className="space-y-2">
            <p className="text-sm">Đã kiểm tra {rows.length} dòng. Khi xác nhận, hệ thống sẽ kiểm tra lại dữ liệu và có thể yêu cầu đối soát thêm.</p>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead><tr><th>Dòng</th><th>Mã BCĐX</th><th>Mã CMS</th><th>Đối chiếu</th><th>Người đề xuất</th><th>Tiến độ trong file</th><th>Lỗi / cảnh báo</th></tr></thead>
                <tbody>{rows.map(row => (
                  <tr key={row.row}>
                    <td>{row.row}</td><td>{row.legacy_code}</td><td>{row.cms_code || '—'}</td>
                    <td>
                      {row.action === 'create' ? 'Dự kiến tạo mới' : row.action === 'update' ? `Đề xuất #${row.proposal_id}` : row.action === 'choose' ? 'Cần chọn ID' : 'Chưa xác định'}
                      {row.candidates?.length > 0 && <div className="text-xs">ID phù hợp: {row.candidates.map(item => item.id).join(', ')}</div>}
                    </td>
                    <td>{row.owner ? `${row.owner.full_name} (#${row.owner.id})` : row.owner_candidates?.length ? `Chọn ID: ${row.owner_candidates.map(item => item.id).join(', ')}` : '—'}</td>
                    <td>
                      <div>{row.proposal_status || '—'} / {row.on_status || '—'}</div>
                      {row.poles?.map((pole, index) => (
                        <div className="text-xs whitespace-nowrap" key={`${pole.model}-${pole.name}-${index}`}>
                          {pole.model} {pole.name}: chốt {pole.committed ?? '—'}, giao {pole.shipped ?? '—'}, nhận {pole.received ?? '—'}, lắp {pole.installed ?? '—'}, nghiệm thu {pole.accepted ?? '—'}, ON {pole.on ?? '—'}
                        </div>
                      ))}
                    </td>
                    <td>
                      {row.errors.map((message, index) => <div className="text-error" key={`e${index}`}>{message}</div>)}
                      {row.warnings.map((message, index) => <div className="text-warning" key={`w${index}`}>{message}</div>)}
                      {!row.errors.length && !row.warnings.length && '—'}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Đóng</button>
          <button type="button" className="btn btn-primary" onClick={() => setConfirmOpen(true)} disabled={!proof || busy || Boolean(result)}>
            {busy ? 'Đang xử lý...' : 'Xác nhận import'}
          </button>
        </div>
        <ConfirmDialog isOpen={confirmOpen} type="warning" title="Xác nhận import dữ liệu"
          message={`Xác nhận ghi ${rows?.length || 0} dòng? Hồ sơ cập nhật sẽ được lưu snapshot trước khi ghi.`}
          confirmText="Xác nhận import" onCancel={() => setConfirmOpen(false)} onConfirm={confirm} />
      </div>
    </Dialog>
  );
};

export default HistoricalOnImportModal;
