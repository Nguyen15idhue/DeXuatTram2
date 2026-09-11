import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const resolveUserId = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const raw = (typeof value === 'object' && value !== null) ? (value.id ?? value.user_id ?? value.value) : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : '';
};

const UserField = ({ field, value, onChange, disabled, error }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const selectedId = resolveUserId(value);
  const selectedUser = options.find(o => Number(o.id) === Number(selectedId));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch(`${API_URL}/admin/users/options/all`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (!cancelled && data.success) setOptions(data.data || []);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="dynamic-field-user">
      <select
        className="select select-bordered w-full"
        value={selectedId === '' ? '' : String(selectedId)}
        disabled={disabled || loading}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? '' : { id: Number(v) });
        }}
      >
        <option value="">{loading ? 'Đang tải...' : '-- Chọn người dùng --'}</option>
        {options.map(u => (
          <option key={u.id} value={String(u.id)}>
            {u.full_name} ({u.role})
          </option>
        ))}
      </select>
      {selectedUser && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
          {selectedUser.full_name} — {selectedUser.role}
        </div>
      )}
      {error && <div className="text-error text-xs mt-1">{error}</div>}
    </div>
  );
};

export default UserField;
