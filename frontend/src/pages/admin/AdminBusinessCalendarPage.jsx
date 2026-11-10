import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';

const ENDPOINT = '/admin/business-calendar';
const DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
const DEFAULT_WINDOWS = [['07:30', '11:30'], ['13:00', '17:00']];

function ShiftEditor({ value, onChange, disabled, label }) {
  const changeTime = (index, side, time) => {
    onChange(value.map((window, i) => i === index ? window.map((item, j) => j === side ? time : item) : window));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.length === 0 && <span className="text-sm text-gray-500">Nghỉ</span>}
      {value.map((window, index) => (
        <div key={index} className="flex items-center gap-1">
          <input type="time" aria-label={`${label} ca ${index + 1} bắt đầu`} value={window[0]} disabled={disabled}
            onChange={event => changeTime(index, 0, event.target.value)} className="rounded border px-2 py-1 disabled:bg-gray-100" />
          <span>–</span>
          <input type="time" aria-label={`${label} ca ${index + 1} kết thúc`} value={window[1]} disabled={disabled}
            onChange={event => changeTime(index, 1, event.target.value)} className="rounded border px-2 py-1 disabled:bg-gray-100" />
          {!disabled && <button type="button" aria-label={`Xóa ${label} ca ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="rounded p-1 text-red-600 hover:bg-red-50"><X size={16} /></button>}
        </div>
      ))}
      {!disabled && <button type="button" onClick={() => onChange([...value, ['07:30', '11:30']])}
        className="flex items-center gap-1 rounded border px-2 py-1 text-sm text-blue-700"><Plus size={14} />Thêm ca</button>}
    </div>
  );
}

export default function AdminBusinessCalendarPage() {
  const { token } = useAuth();
  const [calendar, setCalendar] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [exceptionDate, setExceptionDate] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getWithAuth(ENDPOINT, token).then(response => {
      if (!response.success || !response.data) throw new Error(response.message || 'Không thể tải lịch làm việc');
      if (active) {
        setCalendar(response.data);
        setCanManage(response.meta?.can_manage === true);
      }
    }).catch(err => {
      if (active) setError(err.message || 'Không thể tải lịch làm việc');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token, reload]);

  const disabled = !canManage || saving;
  const addException = () => {
    if (!exceptionDate) return setError('Vui lòng chọn ngày ngoại lệ');
    if (Object.prototype.hasOwnProperty.call(calendar.exceptions, exceptionDate)) return setError('Ngày ngoại lệ đã tồn tại');
    setCalendar(current => ({ ...current, exceptions: { ...current.exceptions, [exceptionDate]: [] } }));
    setExceptionDate('');
    setError('');
    setMessage('');
  };
  const updateException = (date, value) => {
    setCalendar(current => ({ ...current, exceptions: { ...current.exceptions, [date]: value } }));
    setMessage('');
  };
  const removeException = date => {
    setCalendar(current => {
      const exceptions = { ...current.exceptions };
      delete exceptions[date];
      return { ...current, exceptions };
    });
    setMessage('');
  };
  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await api.putWithAuth(ENDPOINT, calendar, token);
      if (!response.success || !response.data) throw new Error(response.message || 'Không thể lưu lịch làm việc');
      setCalendar(response.data);
      setMessage('Đã lưu phiên bản mới. Các hạn đang chạy vẫn dùng lịch cũ.');
    } catch (err) {
      setError(err.message || 'Không thể lưu lịch làm việc');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Lịch làm việc</h1>
          <p className="mt-1 text-sm text-gray-500">Lịch chung toàn hệ thống · Asia/Ho_Chi_Minh (UTC+7) · 1 ngày làm việc = 480 phút.</p>
        </div>
        {!loading && calendar && canManage && <button type="button" disabled={saving} onClick={save}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          <Save size={16} />{saving ? 'Đang lưu…' : 'Lưu lịch'}
        </button>}
      </div>
      {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}
        <button type="button" disabled={saving} onClick={() => setReload(value => value + 1)} className="ml-3 underline">Tải lại lịch</button>
      </div>}
      {message && <div role="status" className="rounded-lg bg-green-50 p-3 text-green-700">{message}</div>}
      {loading ? <p role="status">Đang tải lịch làm việc…</p> : calendar && <>
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          Phiên bản #{calendar.id}. Mỗi lần lưu tạo phiên bản mới; không thay đổi hạn đã bắt đầu.
          {!canManage && <p className="mt-1">Chỉ Super Admin hoặc phòng Back Office được chỉnh sửa.</p>}
        </div>
        <section className="space-y-4 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Lịch hàng tuần</h2>
          {DAYS.map((day, index) => <div key={day} className="flex flex-wrap items-center gap-3 border-t pt-3">
            <span className="w-24 font-medium">{day}</span>
            <ShiftEditor label={day} value={calendar.weekly[String(index + 1)]} disabled={disabled}
              onChange={value => {
                setCalendar(current => ({ ...current, weekly: { ...current.weekly, [index + 1]: value } }));
                setMessage('');
              }} />
          </div>)}
        </section>
        <section className="space-y-4 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Ngày nghỉ và ngoại lệ</h2>
          <p className="text-sm text-gray-500">Ngoại lệ thay thế toàn bộ lịch tuần của ngày đó. Không có ca = nghỉ; thêm ca để làm việc bù. Xóa ngoại lệ để dùng lại lịch tuần.</p>
          {canManage && <div className="flex flex-wrap items-center gap-2">
            <input type="date" aria-label="Ngày ngoại lệ mới" value={exceptionDate} disabled={saving}
              onChange={event => setExceptionDate(event.target.value)} className="rounded border px-3 py-2" />
            <button type="button" disabled={saving} onClick={addException} className="flex items-center gap-1 rounded border px-3 py-2 text-blue-700">
              <Plus size={16} />Thêm ngày ngoại lệ
            </button>
          </div>}
          {Object.keys(calendar.exceptions).length === 0 && <p className="text-sm text-gray-500">Chưa có ngày ngoại lệ.</p>}
          {Object.entries(calendar.exceptions).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => (
            <div key={date} className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{date.split('-').reverse().join('/')}</span>
                {!disabled && <>
                  <button type="button" onClick={() => updateException(date, [])} className="text-sm text-blue-700 underline">Nghỉ cả ngày</button>
                  <button type="button" onClick={() => updateException(date, DEFAULT_WINDOWS.map(window => [...window]))}
                    className="text-sm text-blue-700 underline">Làm việc 8 giờ</button>
                  <button type="button" aria-label={`Xóa ngoại lệ ${date}`} onClick={() => removeException(date)}
                    className="flex items-center gap-1 text-sm text-red-600"><Trash2 size={14} />Xóa ngoại lệ</button>
                </>}
              </div>
              <ShiftEditor label={date} value={value} disabled={disabled} onChange={windows => updateException(date, windows)} />
            </div>
          ))}
        </section>
      </>}
    </div>
  );
}
