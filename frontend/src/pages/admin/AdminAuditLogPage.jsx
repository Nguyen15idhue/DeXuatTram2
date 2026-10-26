import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { importJobService, proposalLogService } from '../../services/api';
import { History, ChevronLeft, ChevronRight, Search } from 'lucide-react';

const PAGE_SIZE = 20;
const TABS = [
  { id: 'proposals', label: 'Hoạt động đề xuất' },
  { id: 'journeys', label: 'Hành trình Lead' },
  { id: 'imports', label: 'Lịch sử nhập Excel' }
];

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const Pagination = ({ page, pagination, onChange }) => (
  <div className="flex items-center justify-between mt-4 text-sm">
    <span>{pagination.total || 0} bản ghi</span>
    <div className="flex items-center gap-2">
      <button className="btn btn-ghost btn-xs" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={14} /> Trước
      </button>
      <span>{page} / {Math.max(1, pagination.totalPages || 1)}</span>
      <button className="btn btn-ghost btn-xs" disabled={page >= (pagination.totalPages || 1)} onClick={() => onChange(page + 1)}>
        Sau <ChevronRight size={14} />
      </button>
    </div>
  </div>
);

export default function AdminAuditLogPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState('proposals');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const filters = { page, limit: PAGE_SIZE };
      const value = filter.trim();
      let response;
      if (tab === 'proposals') {
        if (value) filters.code = value;
        response = await proposalLogService.getAll(filters, token);
      } else if (tab === 'journeys') {
        if (value) filters.code = value;
        response = await proposalLogService.journeyLogs(filters, token);
      } else {
        if (value) filters.entity = value;
        response = await importJobService.list(filters, token);
      }
      if (!response || !response.success) {
        throw new Error(response?.message || 'Không tải được lịch sử hoạt động');
      }
      setRows(Array.isArray(response.data) ? response.data : []);
      setPagination(response.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 0 });
    } catch (err) {
      setRows([]);
      setError(err.message || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  }, [filter, page, tab, token]);

  useEffect(() => { load(); }, [load]);

  const changeTab = (next) => {
    setTab(next);
    setPage(1);
    setFilter('');
  };

  const renderRow = (row) => {
    if (tab === 'proposals') {
      return (
        <tr key={row.id}>
          <td>{formatDate(row.created_at)}</td>
          <td>{row.proposal_code || row.code || (row.proposal_id ? `#${row.proposal_id}` : '—')}</td>
          <td>{row.action || '—'}</td>
          <td>{[row.from_status, row.to_status].filter(Boolean).join(' → ') || '—'}</td>
          <td>{row.actor_name || row.actor || '—'}</td>
          <td className="max-w-sm whitespace-normal">{row.message || row.reason || row.source || '—'}</td>
        </tr>
      );
    }
    if (tab === 'journeys') {
      return (
        <tr key={row.id}>
          <td>{formatDate(row.created_at)}</td>
          <td>{row.entity_type || '—'} · {row.entity_code || row.code || row.entity_id || '—'}</td>
          <td>{row.action || '—'}</td>
          <td>{row.actor_name || row.actor || '—'}</td>
          <td className="max-w-sm whitespace-normal">{row.description || row.message || row.source || '—'}</td>
        </tr>
      );
    }
    return (
      <tr key={row.id}>
        <td>{formatDate(row.created_at)}</td>
        <td>{row.entity || '—'}</td>
        <td>{row.status || '—'}</td>
        <td>{row.full_name || row.created_by || '—'}</td>
        <td>{row.imported ?? row.done ?? 0} / {row.total ?? 0}</td>
        <td>{row.failed ?? 0}</td>
      </tr>
    );
  };

  const headers = tab === 'proposals'
    ? ['Thời gian', 'Mã đề xuất', 'Hành động', 'Trạng thái', 'Người thực hiện', 'Chi tiết']
    : tab === 'journeys'
      ? ['Thời gian', 'Đối tượng', 'Hành động', 'Người thực hiện', 'Chi tiết']
      : ['Thời gian', 'Entity', 'Trạng thái', 'Người nhập', 'Đã xử lý / tổng', 'Lỗi'];

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-5">
        <History size={24} className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Nhật ký hoạt động</h1>
          <p className="text-sm opacity-60">Lịch sử đề xuất, hành trình Lead và nhập Excel.</p>
        </div>
      </div>

      <div className="tabs tabs-bordered mb-4">
        {TABS.map((item) => (
          <button key={item.id} className={`tab ${tab === item.id ? 'tab-active' : ''}`} onClick={() => changeTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 max-w-lg">
        <label className="input input-bordered input-sm flex items-center gap-2 flex-1">
          <Search size={14} />
          <input
            value={filter}
            onChange={(event) => { setFilter(event.target.value); setPage(1); }}
            placeholder={tab === 'imports' ? 'Lọc theo entity' : 'Tìm theo mã'}
          />
        </label>
        <button className="btn btn-primary btn-sm" onClick={load}>Tìm</button>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}
      {loading ? (
        <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-sm opacity-60">Không có dữ liệu.</div>
      ) : (
        <div className="overflow-x-auto bg-base-100 rounded-lg border border-base-300">
          <table className="table table-sm">
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>{rows.map(renderRow)}</tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pagination={pagination} onChange={setPage} />
    </div>
  );
}
