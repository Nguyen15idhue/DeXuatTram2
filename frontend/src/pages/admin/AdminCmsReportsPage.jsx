import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, Play, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cmsReportService } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';

const STATUS_LABELS = { RUNNING: 'Đang chạy', SUCCESS: 'Thành công', PARTIAL: 'Một phần bị lỗi', FAILED: 'Thất bại' };
const formatTime = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

const AdminCmsReportsPage = () => {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('day');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const initialized = useRef(false);
  const load = useCallback(async () => {
    try {
      const response = await cmsReportService.getStatus(token);
      if (!response?.success || !response.data) throw new Error(response?.message || 'Không tải được trạng thái CMS');
      if (!mounted.current) return;
      setData(response.data);
      setError('');
      if (!initialized.current) {
        initialized.current = true;
        setFrom(response.data.yesterday);
        setTo(response.data.yesterday);
      }
    } catch (cause) {
      if (mounted.current) setError(cause.message || 'Không tải được trạng thái CMS');
    }
  }, [token]);
  useEffect(() => {
    mounted.current = true;
    load();
    const timer = setInterval(load, 5000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [load]);
  const run = data?.run;
  const busy = starting || run?.status === 'RUNNING';
  const start = async event => {
    event.preventDefault();
    if (!from || (mode === 'range' && (!to || from > to))) {
      setError('Vui lòng chọn ngày hoặc khoảng ngày hợp lệ');
      return;
    }
    setStarting(true);
    setError('');
    try {
      const response = await cmsReportService.run(from, mode === 'day' ? from : to, token);
      if (!response?.success) throw new Error(response?.message || 'Không bắt đầu được thống kê CMS');
      await load();
    } catch (cause) {
      if (mounted.current) setError(cause.message || 'Không bắt đầu được thống kê CMS');
    } finally {
      if (mounted.current) setStarting(false);
    }
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Thống kê phiên sạc CMS" subtitle="Lấy trực tiếp từ CMS và xuất Google Sheet — không lưu database" />
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {data && !data.configured && <div role="alert" className="alert alert-warning">{data.message}</div>}
      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">Tự động: {data?.schedule || '07:00 Asia/Ho_Chi_Minh — ngày hôm trước'}</p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm btn-ghost" onClick={load}><RefreshCw size={16} /> Làm mới</button>
              {data?.spreadsheetUrl && <a className="btn btn-sm btn-outline" href={data.spreadsheetUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> Mở Google Sheet
              </a>}
            </div>
          </div>
          <form onSubmit={start} className="flex flex-wrap items-end gap-3">
            <label className="form-control">
              <span className="label-text mb-1">Chế độ lấy dữ liệu</span>
              <select aria-label="Chế độ lấy dữ liệu" className="select select-bordered" value={mode} onChange={event => setMode(event.target.value)} disabled={busy}>
                <option value="day">Một ngày</option><option value="range">Khoảng ngày</option>
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">{mode === 'day' ? 'Ngày báo cáo' : 'Từ ngày'}</span>
              <input aria-label={mode === 'day' ? 'Ngày báo cáo' : 'Từ ngày'} type="date" className="input input-bordered" required
                max={data?.yesterday} value={from} disabled={busy} onChange={event => setFrom(event.target.value)} />
            </label>
            {mode === 'range' && <label className="form-control">
              <span className="label-text mb-1">Đến ngày</span>
              <input aria-label="Đến ngày" type="date" className="input input-bordered" required
                min={from} max={data?.yesterday} value={to} disabled={busy} onChange={event => setTo(event.target.value)} />
            </label>}
            <button type="submit" className="btn btn-primary" disabled={busy || !data?.configured}>
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
              Lấy dữ liệu và xuất Google Sheet
            </button>
          </form>
          <div className="text-sm text-base-content/70 space-y-1">
            <p>Trụ mới: ngày tạo cách ngày báo cáo không quá 1 tháng lịch. Phiên FINISHED, gồm phiên 0 đồng; thời lượng và doanh thu tính theo ngày bắt đầu.</p>
            <p>Phiên FINISHED thiếu thời gian kết thúc bị loại khỏi tất cả chỉ số phiên sạc; số phiên bị loại được ghi tại cột Cảnh báo dữ liệu.</p>
            <p>Online/offline là trạng thái lúc lấy dữ liệu, không phải lịch sử. Ngày đã có trên Sheet sẽ được cập nhật, không thêm dòng trùng.</p>
            <p>Tiến độ và kết quả dưới đây chỉ giữ trong bộ nhớ của một backend. Khởi động lại sẽ mất tiến độ; có thể chạy lại ngày cần lấy.</p>
          </div>
        </div>
      </div>
      {run && <section className="space-y-3" aria-label="Lượt thống kê">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Lượt gần nhất: {STATUS_LABELS[run.status] || run.status}</h2>
          <span>{run.processed}/{run.totalDays} ngày</span>
          <span className="text-sm">{run.from} → {run.to}</span>
        </div>
        <p role="status">{run.phase}</p>
        <p className="text-sm text-base-content/60">Bắt đầu: {formatTime(run.startedAt)} · Kết thúc: {formatTime(run.finishedAt)}</p>
        {run.status === 'RUNNING' && <progress className="progress progress-primary w-full" value={run.processed} max={run.totalDays} />}
        {run.errors?.length > 0 && <div role="alert" className="alert alert-error block">
          {run.errors.map((item, index) => <p key={`${item.date || 'run'}-${index}`}>{item.date ? `${item.date}: ` : ''}{item.message}</p>)}
          <p>Ngày bị lỗi chưa được xác nhận đồng bộ. Chọn lại ngày/khoảng ngày để chạy lại.</p>
        </div>}
        {run.rows?.length > 0 && <div className="overflow-x-auto rounded-box border border-base-200">
          <table className="table table-sm">
            <caption className="text-left p-2">Các ngày đã ghi thành công lên Google Sheet</caption>
            <thead><tr>{data.headers.map(header => <th key={header} className="whitespace-nowrap">{header}</th>)}</tr></thead>
            <tbody>{run.rows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={index} className="whitespace-nowrap">
              {[1, 17].includes(index) ? formatTime(cell) : typeof cell === 'number' ? cell.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : cell}
            </td>)}</tr>)}</tbody>
          </table>
        </div>}
      </section>}
    </div>
  );
};

export default AdminCmsReportsPage;
