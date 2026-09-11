import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const UserExternalPanel = ({ userId }) => {
  const { isAdmin } = useAuth();
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [system, setSystem] = useState('1office');
  const [externalId, setExternalId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${API_URL}/admin/users/${userId}/external`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) setMappings(data.data || []);
      else setError(data.message || 'Lỗi tải');
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [load, isAdmin]);

  if (!isAdmin) return null;

  const handleSave = async () => {
    if (!system.trim() || !externalId.trim()) {
      setError('Nhập system và external ID');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${API_URL}/admin/users/${userId}/external`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ system: system.trim(), external_id: externalId.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setExternalId('');
        await load();
      } else {
        setError(data.message || 'Lưu thất bại');
      }
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sys) => {
    if (!window.confirm(`Xóa liên kết hệ "${sys}"?`)) return;
    setError('');
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${API_URL}/admin/users/${userId}/external`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ system: sys })
      });
      const data = await res.json();
      if (data.success) await load();
      else setError(data.message || 'Xóa thất bại');
    } catch {
      setError('Lỗi kết nối');
    }
  };

  return (
    <div className="popup-section">
      <h3 className="popup-section-title">Liên kết hệ thống</h3>
      {loading ? (
        <div className="text-sm text-gray-500">Đang tải...</div>
      ) : (
        <>
          {mappings.length === 0 ? (
            <div className="text-sm text-gray-500">Chưa có liên kết.</div>
          ) : (
            <div className="space-y-1 mb-2">
              {mappings.map(m => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{m.system}</span>
                  <span>= {m.external_id}</span>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleDelete(m.system)}>Xóa</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-xs">Hệ thống</label>
              <input className="input input-bordered input-sm" value={system} onChange={e => setSystem(e.target.value)} placeholder="1office" />
            </div>
            <div>
              <label className="text-xs">ID hồ sơ nhân sự</label>
              <input className="input input-bordered input-sm" value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="VD: 7" />
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={handleSave}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Lấy ở cột "ID Hồ sơ nhân sự" trong danh sách nhân sự của hệ ngoài (KHÔNG phải cột "Mã NS" hay ID liên hệ).
          </div>
          {error && <div className="text-error text-xs mt-1">{error}</div>}
        </>
      )}
    </div>
  );
};

export default UserExternalPanel;
