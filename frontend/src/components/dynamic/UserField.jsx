import { useState, useEffect } from 'react';
import SearchableSelect from '../ui/SearchableSelect';

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

  useEffect(() => {
    if (loading || !selectedId) return;
    if (options.some(o => Number(o.id) === Number(selectedId))) return;
    let cancelled = false;
    const token = localStorage.getItem('token') || '';
    fetch(`${API_URL}/admin/users/${selectedId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data && data.success && data.data) {
          setOptions((prev) => (prev.some(o => Number(o.id) === Number(selectedId)) ? prev : [...prev, data.data]));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loading, selectedId, options]);

  return (
    <div className={`dynamic-field-user${error ? ' has-error' : ''}`}>
      <SearchableSelect
        options={options.map(u => ({ value: String(u.id), label: `${u.full_name} (${u.role})` }))}
        value={selectedId === '' ? '' : String(selectedId)}
        onChange={(v) => onChange(v === '' ? '' : { id: Number(v) })}
        placeholder={loading ? 'Đang tải...' : '-- Chọn người dùng --'}
        disabled={disabled || loading}
        className={error ? 'is-invalid' : ''}
      />
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
