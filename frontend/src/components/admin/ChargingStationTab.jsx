import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { Badge, Button, DataTable, FilterBar, Input, Pagination, Toast } from '../ui';
import ChargingStationDetailModal from './ChargingStationDetailModal';
import {
  CS_CONTRACT_LABELS,
  CS_CONTRACT_VARIANT,
  CS_EDITOR_ROLES,
  CS_FLOW_LABELS,
  CS_FLOW_VARIANT,
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
  CS_SUB_STATUS_LABELS,
  formatCsDate
} from '../../utils/chargingStation';

const PAGE_SIZE = 20;
const EMPTY_TOAST = { message: '', type: 'success' };

const ChargingStationTab = ({ stage }) => {
  const { token, user } = useAuth();
  const canEdit = CS_EDITOR_ROLES.includes(user?.role);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(EMPTY_TOAST);
  const closeToast = useCallback(() => setToast(EMPTY_TOAST), []);

  const load = useCallback(async (targetPage) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ stage, page: targetPage, limit: PAGE_SIZE });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await chargingStationService.getAll(params.toString(), token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (error) {
      setToast({ message: error?.message || 'Không tải được danh sách ON trạm', type: 'error' });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, stage, debouncedSearch]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  const goPage = (next) => {
    setPage(next);
    load(next);
  };

  const columns = useMemo(() => [
    {
      key: 'ma_tram',
      label: 'Mã trạm',
      render: (value) => <span className="font-mono text-xs font-semibold">{value || '—'}</span>
    },
    {
      key: 'ma_de_xuat',
      label: 'Mã đề xuất',
      render: (value, row) => <span className="font-mono text-xs">{value || `#${row.proposal_id}`}</span>
    },
    { key: 'owner_name', label: 'Chủ trạm', render: (value) => value || '—' },
    {
      key: 'address',
      label: 'Địa chỉ',
      render: (value) => <span className="block max-w-[220px] truncate" title={value || ''}>{value || '—'}</span>
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (value, row) => (
        <div className="flex flex-col gap-1 items-start">
          <Badge variant={CS_STATUS_VARIANT[value]} size="sm">{CS_STATUS_LABELS[value] || value}</Badge>
          {row.sub_status && (
            <span className="text-[11px] text-base-content/60">{CS_SUB_STATUS_LABELS[row.sub_status]}</span>
          )}
        </div>
      )
    },
    {
      key: 'contract_status',
      label: 'Hợp đồng',
      render: (value) => <Badge variant={CS_CONTRACT_VARIANT[value]} size="sm" outline>{CS_CONTRACT_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'infra_power_status',
      label: 'Hạ tầng điện',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value]} size="sm" outline>{CS_FLOW_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'infra_site_status',
      label: 'Hạ tầng mặt bằng',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value]} size="sm" outline>{CS_FLOW_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'payment_status',
      label: 'Thanh toán',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value]} size="sm" outline>{CS_FLOW_LABELS[value] || '—'}</Badge>
    },
    { key: 'on_date', label: 'Ngày ON', render: (value) => <span className="whitespace-nowrap">{formatCsDate(value)}</span> }
  ], []);

  const renderActions = (row) => (
    <Button variant="outline" size="xs" onClick={() => setSelectedId(row.id)}>
      Chi tiết
    </Button>
  );

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onClose={closeToast} />

      <FilterBar>
        <div className="flex-1 min-w-0">
          <Input
            placeholder="Tìm mã trạm, mã đề xuất, chủ trạm, SĐT, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!mb-0"
          />
        </div>
        <span className="text-sm text-base-content/60 whitespace-nowrap">
          Tổng: <strong className="text-base-content">{pagination.total}</strong> bản ghi
        </span>
      </FilterBar>

      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage="Chưa có bản ghi ON trạm nào"
        startIndex={(pagination.page - 1) * PAGE_SIZE}
        actions={renderActions}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={goPage}
      />

      {selectedId && (
        <ChargingStationDetailModal
          id={selectedId}
          token={token}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
          onChanged={() => load(page)}
          onToast={(message, type = 'success') => setToast({ message, type })}
        />
      )}
    </div>
  );
};

export default ChargingStationTab;
