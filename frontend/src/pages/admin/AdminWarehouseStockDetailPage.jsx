import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supplierService, warehouseService } from '../../services/api';
import { Badge, Button, DataTable, FilterBar, Input, Loading, PageHeader } from '../../components/ui';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import WarehouseFilterBar from '../../components/admin/WarehouseFilterBar';

const AdminWarehouseStockDetailPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || '';
  const power = searchParams.get('power') || '';
  const initialSupplierId = searchParams.get('supplier_id') || '';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [filters, setFilters] = useState({ search: '', supplier_id: initialSupplierId });
  const debouncedSearch = useDebouncedValue(filters.search, 400);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const supplierRes = await supplierService.getAll('limit=200', token);
        const suppliers = supplierRes?.data || [];
        if (!cancelled) setSuppliers(suppliers);
        const collected = [];
        await Promise.all(suppliers.map(async (supplier) => {
          try {
            if (filters.supplier_id && String(supplier.id) !== String(filters.supplier_id)) return;
            const res = await supplierService.getPoles(supplier.id, token);
            (res?.data || []).forEach((pole) => {
              if (type && String(pole.charging_type) !== String(type)) return;
              if (power && String(pole.power_kw) !== String(power)) return;
              collected.push({
                id: `${supplier.id}-${pole.charging_pole_id || pole.id}`,
                supplier_id: supplier.id,
                supplier_name: supplier.name,
                supplier_logo: supplier.logo,
                name: pole.name,
                charging_type: pole.charging_type,
                power_kw: pole.power_kw,
                quantity: Number(pole.quantity || 0)
              });
            });
          } catch { /* silent */ }
        }));
        if (!cancelled) setRows(collected);
      } catch (error) {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, type, power, filters.supplier_id]);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return rows;
    const q = debouncedSearch.toLowerCase();
    return rows.filter((row) => (row.name || '').toLowerCase().includes(q)
      || (row.supplier_name || '').toLowerCase().includes(q));
  }, [rows, debouncedSearch]);

  const total = filtered.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  const columns = [
    {
      key: 'supplier_name',
      label: 'Nhà cung cấp',
      render: (value, row) => (
        <div className="flex items-center gap-2">
          {row.supplier_logo && <img src={`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/files/${row.supplier_logo}/image?token=${token}`} alt={value} className="h-6 w-6 object-contain rounded" />}
          <span>{value || '—'}</span>
        </div>
      )
    },
    { key: 'name', label: 'Tên/model loại trụ' },
    { key: 'charging_type', label: 'Loại sạc', render: (value) => <Badge variant={value === 'DC' ? 'info' : 'success'} size="sm">{value}</Badge> },
    { key: 'power_kw', label: 'Công suất (kW)', render: (value) => Number(value) },
    { key: 'quantity', label: 'Số lượng tồn', render: (value) => <strong>{value}</strong> }
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Chi tiết tồn kho: ${type || 'Tất cả'} ${power ? `${Number(power)}kW` : ''}`.trim()}
        subtitle="Danh sách các trụ có cùng thông số của toàn bộ nhà cung cấp"
        actions={(
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => warehouseService.exportExcel('stock-detail', token, `type=${encodeURIComponent(type)}&power=${encodeURIComponent(power)}`)}>Xuất Excel</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/kho?tab=stock')}>Quay lại</Button>
          </div>
        )}
      />
      <div className="text-sm text-base-content/60">
        Tổng tồn: <strong className="text-base-content">{total}</strong>
      </div>
      <WarehouseFilterBar filters={filters} onChange={setFilters} suppliers={suppliers} note="Tìm kiếm tồn kho chi tiết" />
      <DataTable columns={columns} data={filtered.map((row, index) => ({ ...row, id: row.id }))} loading={loading} emptyMessage="Chưa có dữ liệu tồn kho" startIndex={0} />
    </div>
  );
};

export default AdminWarehouseStockDetailPage;
