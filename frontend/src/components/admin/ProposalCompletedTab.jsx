import { useCallback, useEffect, useState } from 'react';
import { adminProposalService } from '../../services/api';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';

const PROPOSALS_VIEW_ID = 8;

const ProposalCompletedTab = ({ token, onOpenProposal }) => {
  const viewId = useDefaultViewId('station_proposals', PROPOSALS_VIEW_ID);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('statuses', statusFilter || 'COMPLETED,CANCELLED');
      params.set('page', String(page));
      params.set('limit', String(pageSize));
      if (search) params.set('search', search);
      const res = await adminProposalService.getAllWithParams(params.toString(), token);
      if (res && res.success) {
        setItems(res.data || []);
        setPagination(res.pagination || { page, limit: pageSize, total: 0, totalPages: 0 });
      } else {
        setError(res?.message || 'Không tải được danh sách đề xuất đã hoàn thành');
      }
    } catch (e) {
      setError(e?.message || 'Không tải được danh sách đề xuất đã hoàn thành');
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const cellRenderers = {
    ma_de_xuat: (row, value) => (
      <ProposalCodeLink id={row.id} code={value} onOpen={onOpenProposal} />
    ),
    nguoi_de_xuat: (row, value) => (
      row.user_id
        ? <ProposalPersonLink id={row.user_id} name={row.user_name || value} />
        : <span>{value || 'Khách'}</span>
    )
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <input
          type="search"
          className="input input-bordered input-sm w-full sm:w-72"
          placeholder="Tìm mã đề xuất, người đề xuất, địa chỉ..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="select select-bordered select-sm w-full sm:w-52"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">Đã hoàn thành & Đã hủy</option>
          <option value="COMPLETED">Đã hoàn thành</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          Làm mới
        </button>
        <span className="text-sm text-base-content/60 sm:ml-auto">
          {pagination.total} đề xuất
        </span>
      </div>

      {error && <div className="alert alert-error text-sm mb-3">{error}</div>}

      {loading && items.length === 0 ? (
        <div className="text-center py-10 text-base-content/60">Đang tải...</div>
      ) : (
        <DynamicTable
          entity="station_proposals"
          viewId={viewId}
          data={items}
          startIndex={(pagination.page - 1) * pagination.limit}
          cellRenderers={cellRenderers}
          actions={(row) => (
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => onOpenProposal && onOpenProposal(row.id)}
            >
              Xem
            </button>
          )}
        />
      )}

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />
    </div>
  );
};

export default ProposalCompletedTab;
