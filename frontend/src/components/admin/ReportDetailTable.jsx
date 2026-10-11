import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { reportService } from '../../services/api';

const fmtDate = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '');
const fmtNum = (v) => (v === null || v === undefined ? '—' : v);

const ReportDetailTable = ({ filters, token, pageSize = 10, showExport = false }) => {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const params = useCallback((page) => {
    const p = {};
    Object.entries(filters || {}).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p[k] = v; });
    p.page = page;
    p.limit = pageSize;
    return p;
  }, [filters, pageSize]);

  const load = useCallback(async (page) => {
    try {
      setLoading(true);
      setError('');
      const res = await reportService.getLeadDetails(params(page), token);
      if (res.success) {
        setRows(res.data.items || []);
        setPagination(res.data.pagination || { page, total: 0, totalPages: 1 });
      } else {
        setError(res.message || 'Lỗi tải dữ liệu');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  }, [params, token]);

  useEffect(() => { load(1); }, [load]);

  const exportExcel = async () => {
    try {
      setExporting(true);
      const payload = { detail: true, filters: {} };
      Object.entries(filters || {}).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) payload.filters[k] = v; });
      const res = await fetch('/api/admin/reports/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bao_cao_chi_tiet_lead.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Xuất Excel thất bại');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {showExport && (
        <div className="flex justify-end mb-1">
          <button type="button" className="btn btn-xs btn-outline gap-1" onClick={exportExcel} disabled={exporting}>
            <Download size={13} /> {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
        </div>
      )}
      {loading && <p className="text-sm opacity-60">Đang tải...</p>}
      {!loading && error && <p className="text-sm text-error">{error}</p>}
      {!loading && !error && rows.length === 0 && <p className="text-sm opacity-60">Không có dữ liệu</p>}
      {!loading && !error && rows.length > 0 && (
        <>
          <div className="overflow-auto flex-1 min-h-0">
            <table className="table table-xs w-full" data-testid="detail-table">
              <thead>
                <tr>
                  <th>Mã Lead</th>
                  <th>Họ tên</th>
                  <th>Người phụ trách</th>
                  <th>Đề xuất</th>
                  <th>Trạm</th>
                  <th>Ngày ON</th>
                  <th className="text-right">Tổng ngày</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.lead_code}</td>
                    <td>{r.full_name}</td>
                    <td>{r.assignee_name || '—'}</td>
                    <td>{r.proposals.length}</td>
                    <td>{r.stations.length}</td>
                    <td>{r.on_at ? fmtDate(r.on_at) : '—'}</td>
                    <td className="text-right">{fmtNum(r.total_days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2 mt-1">
            <button type="button" className="btn btn-ghost btn-xs" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs" data-testid="detail-page">{pagination.page}/{pagination.totalPages} · {pagination.total} dòng</span>
            <button type="button" className="btn btn-ghost btn-xs" disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportDetailTable;
