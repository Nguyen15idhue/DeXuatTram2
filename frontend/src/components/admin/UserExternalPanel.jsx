import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { externalUserService } from '../../services/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const UserExternalPanel = ({ userId }) => {
  const { isAdmin, token } = useAuth();
  const [mappings, setMappings] = useState([]);
  const [extUsers, setExtUsers] = useState([]);
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
  }, [userId, token]);

  const loadExtUsers = useCallback(async (sys) => {
    try {
      const res = await externalUserService.getAll(sys, token);
      if (res.success) setExtUsers(res.data || []);
    } catch {
      setExtUsers([]);
    }
  }, [token]);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [load, isAdmin]);

  useEffect(() => {
    if (isAdmin && system.trim()) loadExtUsers(system.trim());
  }, [isAdmin, system, loadExtUsers]);

  if (!isAdmin) return null;

  const extLabel = (u) => {
    const code = u.code ? `${u.code} - ` : '';
    const dept = u.department_name ? ` (${u.department_name})` : '';
    const noAcc = !u.contact_id ? ' — chưa có tài khoản 1Office' : '';
    return `${code}${u.fullname || `ID ${u.external_id}`}${dept}${noAcc}`;
  };

  const mappingLabel = (externalId) => {
    const u = extUsers.find(x => String(x.external_id) === String(externalId));
    if (u) return extLabel(u);
    return `ID ${externalId} (không có trong danh sách)`;
  };

  const handleSave = async () => {
    if (!system.trim() || !externalId) {
      setError('Chọn hệ thống và nhân sự');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/external`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ system: system.trim(), external_id: String(externalId) })
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
                  <span>= {mappingLabel(m.external_id)}</span>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleDelete(m.system)}>Xóa</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-xs">Hệ thống</label>
              <input className="input input-bordered input-sm w-24" value={system} onChange={e => setSystem(e.target.value)} placeholder="1office" />
            </div>
            <div className="flex-1">
              <label className="text-xs">Nhân sự (Mã NS - Tên)</label>
              <select
                className="select select-bordered select-sm w-full"
                value={externalId}
                onChange={e => setExternalId(e.target.value)}
              >
                <option value="">-- Chọn nhân sự --</option>
                {extUsers.map(u => (
                  <option key={u.id} value={String(u.external_id)} disabled={!u.contact_id} title={!u.contact_id ? 'Chưa có tài khoản 1Office – không giao việc được' : ''}>{extLabel(u)}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || !externalId} onClick={handleSave}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
          {extUsers.length === 0 && (
            <div className="text-xs text-gray-500 mt-1">
              Chưa có danh sách nhân sự. Vào Cấu hình API → "1office nhân sự" → Đồng bộ.
            </div>
          )}
          {error && <div className="text-error text-xs mt-1">{error}</div>}
        </>
      )}
    </div>
  );
};

export default UserExternalPanel;
