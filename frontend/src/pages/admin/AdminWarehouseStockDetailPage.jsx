import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supplierService, warehouseService } from '../../services/api';
import { Badge, Button, DataTable, Dialog, Input, PageHeader, Toast } from '../../components/ui';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import WarehouseFilterBar from '../../components/admin/WarehouseFilterBar';
import { comparePolesByPower } from '../../utils/warehouse';

const AdminWarehouseStockDetailPage = () => {
  const { token, user } = useAuth();
  const canAdjustStock = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);
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
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const supplierRes = await supplierService.getAll('limit=200', token);
        if (!supplierRes?.success) throw new Error(supplierRes?.message || 'Không tải được danh sách nhà cung cấp');
        const suppliers = supplierRes?.data || [];
        if (!cancelled) setSuppliers(suppliers);
        const collected = [];
        await Promise.all(suppliers.map(async (supplier) => {
          if (filters.supplier_id && String(supplier.id) !== String(filters.supplier_id)) return;
          const res = await supplierService.getPoles(supplier.id, token);
          if (!res?.success) throw new Error(res?.message || 'Không tải được tồn kho nhà cung cấp');
          (res.data || []).forEach((pole) => {
            if (type && String(pole.charging_type) !== String(type)) return;
            if (power && Number(pole.power_kw) !== Number(power)) return;
            collected.push({
              id: `${supplier.id}-${pole.charging_pole_id || pole.id}`,
              pole_id: pole.charging_pole_id || pole.id,
              supplier_id: supplier.id,
              supplier_name: supplier.name,
              supplier_logo: supplier.logo,
              name: pole.name,
              charging_type: pole.charging_type,
              power_kw: pole.power_kw,
              quantity: Number(pole.quantity || 0)
            });
          });
        }));
        if (!cancelled) setRows(collected.sort(comparePolesByPower));
      } catch (error) {
        if (!cancelled) {
          setRows([]);
          setError(error?.message || 'Không tải được tồn kho');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, type, power, filters.supplier_id, revision]);

  const openEdit = (row) => {
    setDialog(row);
    setQuantity(String(row.quantity));
    setSaveError('');
  };

  const save = async () => {
    const next = Number(quantity);
    if (!quantity.trim() || !Number.isInteger(next) || next < 0 || next > 2147483647) {
      setSaveError('Số lượng tồn phải là số nguyên từ 0 đến 2147483647');
      return;
    }
    setBusy(true);
    setSaveError('');
    try {
      await warehouseService.adjustStock(dialog.supplier_id, dialog.pole_id, {
        quantity: next, expected_quantity: dialog.quantity
      }, token);
      setDialog(null);
      setRevision((value) => value + 1);
      setToast({ message: 'Đã cập nhật tồn kho', type: 'success' });
    } catch (error) {
      if (error?.code === 'STOCK_CONFLICT') {
        setDialog(null);
        setRevision((value) => value + 1);
        setToast({ message: error.message, type: 'error' });
      } else {
        setSaveError(error?.message || 'Cập nhật tồn kho thất bại');
      }
    } finally {
      setBusy(false);
    }
  };

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
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      {error ? <div role="alert" className="alert alert-error">{error}</div> : (
        <div className="text-sm text-base-content/60">
          Tổng tồn: <strong className="text-base-content">{loading ? '…' : total}</strong>
        </div>
      )}
      <WarehouseFilterBar filters={filters} onChange={setFilters} suppliers={suppliers} note="Tìm kiếm tồn kho chi tiết" />
      {!error && <DataTable columns={columns} data={filtered} loading={loading} emptyMessage="Chưa có dữ liệu tồn kho" startIndex={0}
        actions={canAdjustStock ? (row) => <Button variant="outline" size="xs" onClick={() => openEdit(row)}>Sửa tồn kho</Button> : undefined} />}
      <Dialog isOpen={!!dialog} onClose={() => { if (!busy) setDialog(null); }} title="Sửa tồn kho" size="sm">
        {dialog && (
          <div className="space-y-3">
            <div className="text-sm space-y-1">
              <div>Nhà cung cấp: <strong>{dialog.supplier_name}</strong></div>
              <div>Loại trụ: <strong>{dialog.name} ({dialog.charging_type} {Number(dialog.power_kw)}kW)</strong></div>
              <div>Tồn hiện tại: <strong>{dialog.quantity}</strong></div>
            </div>
            <Input label="Số lượng tồn mới" aria-label="Số lượng tồn mới" type="number" min="0" max="2147483647" step="1" required
              value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={busy} />
            {saveError && <div role="alert" className="alert alert-error">{saveError}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Hủy</Button>
              <Button loading={busy} onClick={save}>Lưu</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default AdminWarehouseStockDetailPage;
