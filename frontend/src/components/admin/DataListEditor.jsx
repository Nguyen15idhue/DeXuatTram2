import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { dataListService } from '../../services/api';
import { formatNumber } from '../../utils/formatNumber';
import Loading from '../Loading';
import Toast from '../Toast';
import ErrorMessage from '../ErrorMessage';

const DataListEditor = () => {
  const { token } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [editingCell, setEditingCell] = useState(null);
  const [newRow, setNewRow] = useState(null);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await dataListService.getById(id, token);
      if (res.success) {
        setList(res.data);
        setRows(res.data.rows || []);
      } else {
        setError(res.message || 'Lỗi tải dữ liệu');
      }
    } catch {
      setError('Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { loadList(); }, [loadList]);

  const columns = list?.columns_config || [];

  const handleCellEdit = async (rowId, colKey, value) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const updatedData = { ...row.data, [colKey]: value };
    try {
      const res = await dataListService.updateRow(id, rowId, updatedData, token);
      if (res.success) {
        setRows(rows.map(r => r.id === rowId ? { ...r, data: updatedData } : r));
        setEditingCell(null);
      } else {
        setToast({ message: res.message || 'Lỗi cập nhật', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi server', type: 'error' });
    }
  };

  const handleAddRow = async () => {
    if (!newRow) {
      const empty = {};
      columns.forEach(c => { empty[c.key] = ''; });
      setNewRow(empty);
      return;
    }
    try {
      const res = await dataListService.addRows(id, [{ data: newRow, sort_order: rows.length }], token);
      if (res.success) {
        setRows([...rows, ...res.data.filter(r => !rows.find(exist => exist.id === r.id))]);
        setNewRow(null);
        setToast({ message: 'Đã thêm dòng', type: 'success' });
      } else {
        setToast({ message: res.message || 'Lỗi thêm', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi server', type: 'error' });
    }
  };

  const handleDeleteRow = async (rowId) => {
    try {
      const res = await dataListService.deleteRow(id, rowId, token);
      if (res.success) {
        setRows(rows.filter(r => r.id !== rowId));
        setToast({ message: 'Đã xóa dòng', type: 'success' });
      } else {
        setToast({ message: res.message || 'Lỗi xóa', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi server', type: 'error' });
    }
  };

  if (loading) return <Loading message="Đang tải dữ liệu..." />;
  if (error && !list) return <div className="admin-fields-page"><ErrorMessage message={error} onRetry={loadList} /></div>;
  if (!list) return <div className="admin-fields-page"><ErrorMessage message="Không tìm thấy data list" /></div>;

  return (
    <div className="admin-data-lists-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <div>
          <button onClick={() => navigate('/admin/data-lists')} className="btn-back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 14, marginBottom: 4 }}>
            ← Quay lại danh sách
          </button>
          <h1>{list.name}</h1>
          {list.description && <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>{list.description}</p>}
        </div>
        <button className="btn btn-primary" onClick={handleAddRow}>+ Thêm dòng</button>
      </div>

      {error && <ErrorMessage message={error} />}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              {columns.map(col => (
                <th key={col.key}>{col.label}</th>
              ))}
              <th style={{ width: 80, textAlign: 'center' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id}>
                <td>{i + 1}</td>
                {columns.map(col => (
                  <td key={col.key}
                    onDoubleClick={() => setEditingCell({ rowId: row.id, colKey: col.key })}>
                    {editingCell?.rowId === row.id && editingCell?.colKey === col.key ? (
                      <input
                        autoFocus
                        defaultValue={row.data[col.key] || ''}
                        onBlur={e => handleCellEdit(row.id, col.key, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCellEdit(row.id, col.key, e.target.value); if (e.key === 'Escape') setEditingCell(null); }}
                        style={{ width: '100%', padding: '4px 8px', border: '1px solid #3b82f6', borderRadius: 4, fontSize: 14 }}
                      />
                    ) : (
                      <span style={{ cursor: 'pointer' }}>
                        {col.type === 'number' && row.data[col.key]
                          ? formatNumber(row.data[col.key], { format: col.number_format || 'plain', decimalPlaces: col.decimal_places })
                          : (row.data[col.key] || '—')}
                      </span>
                    )}
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}>
                  <button className="btn btn-sm btn-delete" onClick={() => handleDeleteRow(row.id)}>Xóa</button>
                </td>
              </tr>
            ))}
            {newRow && (
              <tr style={{ background: '#f0fdf4' }}>
                <td>{rows.length + 1}</td>
                {columns.map(col => (
                  <td key={col.key}>
                    <input
                      autoFocus={columns[0].key === col.key}
                      value={newRow[col.key] || ''}
                      onChange={e => setNewRow({ ...newRow, [col.key]: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddRow(); if (e.key === 'Escape') setNewRow(null); }}
                      style={{ width: '100%', padding: '4px 8px', border: '1px solid #10b981', borderRadius: 4, fontSize: 14 }}
                    />
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => setNewRow(null)}>Hủy</button>
                </td>
              </tr>
            )}
            {rows.length === 0 && !newRow && (
              <tr>
                <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>
                  Chưa có dữ liệu. Nhấn "Thêm dòng" để bắt đầu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 10, fontSize: 13, color: '#6b7280' }}>
        Double-click để chỉnh sửa ô. Enter để lưu, Esc để hủy. Tổng: {rows.length} dòng
      </p>
    </div>
  );
};

export default DataListEditor;
