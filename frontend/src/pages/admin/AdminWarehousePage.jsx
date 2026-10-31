import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { warehouseService } from '../../services/api';
import { Badge, Button, ConfirmDialog, DataTable, Dialog, FilterBar, Input, Loading, Pagination, Select, Toast } from '../../components/ui';
import FileUpload from '../../components/dynamic/FileUpload';
import PageHeader from '../../components/ui/PageHeader';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const TABS = [
  { key: 'stock', label: 'Tồn kho' },
  { key: 'imports', label: 'Nhập kho' },
  { key: 'exports', label: 'Xuất kho' },
  { key: 'poles', label: 'Loại trụ sạc' }
];

const EMPTY_TOAST = { message: '', type: 'success' };

const AdminWarehousePage = () => {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'poles');
  const [toast, setToast] = useState(EMPTY_TOAST);
  const closeToast = useCallback(() => setToast(EMPTY_TOAST), []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some((item) => item.key === tab)) setActiveTab(tab);
  }, [searchParams]);

  const changeTab = (tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'poles') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Quản lý kho" subtitle="Danh mục trụ sạc, nhập kho, xuất kho và tồn kho" />
      <div role="tablist" className="tabs tabs-boxed w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className={`tab ${activeTab === tab.key ? 'tab-active' : ''}`}
            onClick={() => changeTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Toast message={toast.message} type={toast.type} onClose={closeToast} />

      {activeTab === 'poles' && <PolesTab token={token} onToast={(m, t = 'success') => setToast({ message: m, type: t })} />}
      {activeTab === 'stock' && <StockTab token={token} onToast={(m, t = 'success') => setToast({ message: m, type: t })} />}
      {activeTab === 'imports' && <ImportsTab token={token} onToast={(m, t = 'success') => setToast({ message: m, type: t })} />}
      {activeTab === 'exports' && <ExportsTab token={token} onToast={(m, t = 'success') => setToast({ message: m, type: t })} />}
    </div>
  );
};

const PolesTab = ({ token, onToast }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [dialog, setDialog] = useState({ open: false, record: null });
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [form, setForm] = useState({ name: '', charging_type: 'AC', power_kw: '', supplier: '', note: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (targetPage = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: targetPage, limit: 20 });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await warehouseService.listPoles(params.toString(), token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: 20, total: 0, totalPages: 1 });
    } catch (error) {
      onToast(error?.message || 'Không tải được danh sách trụ sạc', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, debouncedSearch]);

  useEffect(() => { setPage(1); load(1); }, [load]);

  const openCreate = () => {
    setForm({ name: '', charging_type: 'AC', power_kw: '', supplier: '', note: '' });
    setDialog({ open: true, record: null });
  };

  const openEdit = (record) => {
    setForm({
      name: record.name || '',
      charging_type: record.charging_type || 'AC',
      power_kw: record.power_kw || '',
      supplier: record.supplier || '',
      note: record.note || ''
    });
    setDialog({ open: true, record });
  };

  const save = async () => {
    setBusy(true);
    try {
      if (dialog.record) await warehouseService.updatePole(dialog.record.id, form, token);
      else await warehouseService.createPole(form, token);
      setDialog({ open: false, record: null });
      onToast(dialog.record ? 'Đã cập nhật loại trụ' : 'Đã thêm loại trụ', 'success');
      load(page);
    } catch (error) {
      onToast(error?.message || 'Lưu thất bại', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id) => setConfirm({ open: true, id });

  const confirmDelete = async () => {
    const id = confirm.id;
    setConfirm({ open: false, id: null });
    try {
      await warehouseService.deletePole(id, token);
      onToast('Đã xóa loại trụ', 'success');
      load(page);
    } catch (error) {
      onToast(error?.message || 'Xóa thất bại', 'error');
    }
  };

  const columns = [
    { key: 'name', label: 'Tên loại trụ' },
    { key: 'charging_type', label: 'Loại sạc', render: (value) => <Badge variant={value === 'DC' ? 'info' : 'success'} size="sm">{value}</Badge> },
    { key: 'power_kw', label: 'Công suất (kW)', render: (value) => Number(value) },
    { key: 'supplier', label: 'Nhà cung cấp', render: (value) => value || '—' }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-base-content/60">Tổng: <strong>{pagination.total}</strong> loại trụ</span>
        <Button size="sm" onClick={openCreate}>Thêm loại trụ</Button>
      </div>

      <FilterBar>
        <div className="flex-1 min-w-0">
          <Input placeholder="Tìm tên hoặc nhà cung cấp..." value={search} onChange={(e) => setSearch(e.target.value)} className="!mb-0" />
        </div>
      </FilterBar>

      <DataTable columns={columns} data={items} loading={loading} emptyMessage="Chưa có trụ sạc nào" startIndex={(page - 1) * 20} actions={(row) => (
        <div className="flex gap-1">
          <Button variant="outline" size="xs" onClick={() => openEdit(row)}>Sửa</Button>
          <Button variant="outline-error" size="xs" onClick={() => remove(row.id)}>Xóa</Button>
        </div>
      )} />

      <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={(next) => { setPage(next); load(next); }} />

      <Dialog isOpen={dialog.open} onClose={() => setDialog({ open: false, record: null })} title={dialog.record ? 'Sửa loại trụ' : 'Thêm loại trụ'} size="md">
        <div className="space-y-3">
          <Input label="Tên loại trụ" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Loại sạc" options={[{ value: 'AC', label: 'AC' }, { value: 'DC', label: 'DC' }]} value={form.charging_type} onChange={(e) => setForm({ ...form, charging_type: e.target.value })} placeholder={null} />
            <Input label="Công suất (kW)" type="number" min="1" step="1" value={form.power_kw} onChange={(e) => setForm({ ...form, power_kw: e.target.value })} />
          </div>
          <Input label="Nhà cung cấp" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          <div className="form-control w-full">
            <span className="label-text font-medium mb-1">Ghi chú</span>
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog({ open: false, record: null })} disabled={busy}>Hủy</Button>
            <Button loading={busy} onClick={save}>Lưu</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog isOpen={confirm.open} title="Xóa trụ sạc" message="Chỉ xóa được khi chưa phát sinh nhập/xuất kho." type="danger" confirmText="Xóa" onConfirm={confirmDelete} onCancel={() => setConfirm({ open: false, id: null })} />
    </div>
  );
};

const StockTab = ({ token, onToast }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await warehouseService.getStock(debouncedSearch ? `search=${encodeURIComponent(debouncedSearch)}` : '', token);
        if (!cancelled) setItems(res?.data || []);
      } catch (error) {
        if (!cancelled) onToast(error?.message || 'Không tải được tồn kho', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, debouncedSearch]);

  const columns = [
    { key: 'name', label: 'Trụ sạc' },
    { key: 'charging_type', label: 'Loại', render: (value) => <Badge variant={value === 'DC' ? 'info' : 'success'} size="sm">{value}</Badge> },
    { key: 'power_kw', label: 'Công suất (kW)', render: (value) => Number(value) },
    { key: 'quantity', label: 'Tồn kho', render: (value) => <strong>{value}</strong> },
    { key: 'supplier', label: 'Nhà cung cấp', render: (value) => value || '—' }
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="flex-1 min-w-0">
          <Input placeholder="Tìm trụ sạc..." value={search} onChange={(e) => setSearch(e.target.value)} className="!mb-0" />
        </div>
      </FilterBar>
      <DataTable columns={columns} data={items} loading={loading} emptyMessage="Chưa có trụ sạc nào" />
    </div>
  );
};

const ImportsTab = ({ token, onToast }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [poles, setPoles] = useState([]);
  const [dialog, setDialog] = useState({ open: false });
  const [form, setForm] = useState({ import_date: '', charging_station_id: '', note: '', items: [{ pole_id: '', quantity: 1 }], evidence: [] });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (targetPage = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await warehouseService.listImports(`page=${targetPage}&limit=20`, token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: 20, total: 0, totalPages: 1 });
    } catch (error) {
      onToast(error?.message || 'Không tải được phiếu nhập', 'error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { setPage(1); load(1); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await warehouseService.listPoles('limit=200', token);
        setPoles(res?.data || []);
      } catch { /* silent */ }
    })();
  }, [token]);

  const addRow = () => setForm((prev) => ({ ...prev, items: [...prev.items, { pole_id: '', quantity: 1 }] }));
  const removeRow = (index) => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  const updateRow = (index, patch) => setForm((prev) => ({
    ...prev,
    items: prev.items.map((row, i) => (i === index ? { ...row, ...patch } : row))
  }));

  const openCreate = () => {
    setForm({ import_date: new Date().toISOString().slice(0, 16), charging_station_id: '', note: '', items: [{ pole_id: '', quantity: 1 }], evidence: [] });
    setDialog({ open: true });
  };

  const save = async () => {
    setBusy(true);
    try {
      await warehouseService.createImport({
        import_date: form.import_date,
        charging_station_id: form.charging_station_id || null,
        note: form.note,
        items: form.items.map((row) => ({ pole_id: Number(row.pole_id), quantity: Number(row.quantity) })),
        evidence_file_ids: (form.evidence || []).map((file) => file.id)
      }, token);
      setDialog({ open: false });
      onToast('Đã nhập kho', 'success');
      load(page);
    } catch (error) {
      onToast(error?.message || 'Nhập kho thất bại', 'error');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'id', label: 'Mã phiếu' },
    { key: 'importer_name', label: 'Người nhập', render: (value) => value || '—' },
    { key: 'import_date', label: 'Ngày nhập', render: (value) => formatDateTime(value) },
    { key: 'ma_de_xuat', label: 'Trạm liên quan', render: (value, row) => row.ma_tram || value || '—' },
    {
      key: 'items',
      label: 'Chi tiết',
      render: (value) => (value || []).map((item) => `${item.name} x${item.quantity}`).join(', ') || '—'
    },
    {
      key: 'evidence_files',
      label: 'Minh chứng',
      render: (value) => (value || []).length === 0 ? '—' : (value || []).map((file) => (
        <a key={file.id} className="link link-primary text-xs mr-2" href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/files/${file.id}/download?token=${token}`} target="_blank" rel="noreferrer">
          {file.original_name}
        </a>
      ))
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-base-content/60">Tổng: <strong>{pagination.total}</strong> phiếu nhập</span>
        <Button size="sm" onClick={openCreate}>Tạo phiếu nhập</Button>
      </div>

      <DataTable columns={columns} data={items} loading={loading} emptyMessage="Chưa có phiếu nhập kho nào" startIndex={(page - 1) * 20} />

      <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={(next) => { setPage(next); load(next); }} />

      <Dialog isOpen={dialog.open} onClose={() => setDialog({ open: false })} title="Tạo phiếu nhập kho" size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Ngày nhập" type="datetime-local" value={form.import_date} onChange={(e) => setForm({ ...form, import_date: e.target.value })} required />
            <Input label="Ghi chú" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Chi tiết nhập</span>
              <Button variant="outline" size="xs" onClick={addRow}>Thêm dòng</Button>
            </div>
            {form.items.map((row, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-7">
                  <Select
                    label={index === 0 ? 'Trụ sạc' : undefined}
                    options={poles.map((pole) => ({ value: String(pole.id), label: `${pole.name} (${pole.charging_type} ${Number(pole.power_kw)}kW) - tồn ${pole.quantity}` }))}
                    value={row.pole_id}
                    onChange={(e) => updateRow(index, { pole_id: e.target.value })}
                    placeholder="Chọn trụ sạc"
                  />
                </div>
                <div className="col-span-3">
                  <Input label={index === 0 ? 'Số lượng' : undefined} type="number" value={row.quantity} onChange={(e) => updateRow(index, { quantity: e.target.value })} />
                </div>
                <div className="col-span-2">
                  {form.items.length > 1 && (
                    <Button variant="ghost" size="xs" onClick={() => removeRow(index)}>Xóa</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <span className="font-medium text-sm">Minh chứng nhập kho</span>
            <FileUpload
              value={form.evidence}
              onChange={(value) => setForm({ ...form, evidence: Array.isArray(value) ? value : (value ? [value] : []) })}
              multiple
              accept="image/*,application/pdf"
              fileConfig={{ maxSize: 10 }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog({ open: false })} disabled={busy}>Hủy</Button>
            <Button loading={busy} onClick={save}>Lưu phiếu nhập</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

const ExportsTab = ({ token, onToast }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [poles, setPoles] = useState([]);
  const [stations, setStations] = useState([]);
  const [committedItems, setCommittedItems] = useState([]);
  const [dialog, setDialog] = useState({ open: false });
  const [form, setForm] = useState({ export_date: '', charging_station_id: '', reason: '', items: [{ pole_id: '', quantity: 1 }] });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (targetPage = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await warehouseService.listExports(`page=${targetPage}&limit=20`, token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: 20, total: 0, totalPages: 1 });
    } catch (error) {
      onToast(error?.message || 'Không tải được phiếu xuất', 'error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { setPage(1); load(1); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const poleRes = await warehouseService.listPoles('limit=200', token);
        setPoles(poleRes?.data || []);
        const stationRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/admin/charging-stations?stage=thong-tin-chung&limit=200`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then((r) => r.json());
        setStations(stationRes?.data || []);
      } catch { /* silent */ }
    })();
  }, [token]);

  useEffect(() => {
    if (!form.charging_station_id || !token) {
      setCommittedItems([]);
      return;
    }
    (async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/admin/charging-stations/${form.charging_station_id}/committed-export-items`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
          setCommittedItems([]);
          return;
        }
        const res = await response.json();
        setCommittedItems(res?.data || []);
      } catch {
        setCommittedItems([]);
      }
    })();
  }, [form.charging_station_id, token]);

  const addRow = () => setForm((prev) => ({ ...prev, items: [...prev.items, { pole_id: '', quantity: 1 }] }));
  const removeRow = (index) => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  const updateRow = (index, patch) => setForm((prev) => ({
    ...prev,
    items: prev.items.map((row, i) => (i === index ? { ...row, ...patch } : row))
  }));

  const openCreate = () => {
    setForm({ export_date: new Date().toISOString().slice(0, 16), charging_station_id: '', reason: '', items: [{ pole_id: '', quantity: 1 }] });
    setDialog({ open: true });
  };

  const save = async () => {
    if (!form.charging_station_id) {
      onToast('Vui lòng chọn trạm nhận', 'error');
      return;
    }
    const normalizedItems = form.items.map((row) => ({
      pole_id: Number(row.pole_id),
      quantity: Number(row.quantity)
    }));
    if (normalizedItems.some((item) => !Number.isInteger(item.pole_id) || item.pole_id <= 0)) {
      onToast('Vui lòng chọn trụ sạc cho tất cả các dòng', 'error');
      return;
    }
    if (normalizedItems.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      onToast('Số lượng xuất phải là số nguyên lớn hơn 0', 'error');
      return;
    }
    for (const item of normalizedItems) {
      const pole = poles.find((p) => p.id === item.pole_id);
      const committed = committedItems.find((c) => c.pole_id === item.pole_id);
      const maxByStock = pole ? Number(pole.quantity) : 0;
      const maxByCommitted = committed ? Number(committed.committed_quantity) : 0;
      const maxAllowed = committed ? Math.min(maxByCommitted, maxByStock) : maxByStock;
      if (item.quantity > maxAllowed) {
        onToast(`Số lượng xuất vượt quá số lượng cho phép. Số lượng tối đa có thể xuất là ${maxAllowed} trụ. Vui lòng kiểm tra lại.`, 'error');
        return;
      }
    }

    setBusy(true);
    try {
      await warehouseService.createExport({
        export_date: form.export_date,
        charging_station_id: Number(form.charging_station_id),
        reason: form.reason,
        items: normalizedItems
      }, token);
      setDialog({ open: false });
      onToast('Đã xuất kho', 'success');
      load(page);
    } catch (error) {
      onToast(error?.message || 'Xuất kho thất bại', 'error');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'id', label: 'Mã phiếu' },
    { key: 'exporter_name', label: 'Người xuất', render: (value) => value || '—' },
    { key: 'export_date', label: 'Ngày xuất', render: (value) => formatDateTime(value) },
    { key: 'ma_tram', label: 'Trạm nhận', render: (value, row) => value || row.ma_de_xuat || '—' },
    { key: 'reason', label: 'Lý do', render: (value) => value || '—' },
    {
      key: 'items',
      label: 'Chi tiết',
      render: (value) => (value || []).map((item) => `${item.name} x${item.quantity}`).join(', ') || '—'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-base-content/60">Tổng: <strong>{pagination.total}</strong> phiếu xuất</span>
        <Button size="sm" onClick={openCreate}>Tạo phiếu xuất</Button>
      </div>

      <DataTable columns={columns} data={items} loading={loading} emptyMessage="Chưa có phiếu xuất kho nào" startIndex={(page - 1) * 20} />

      <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={(next) => { setPage(next); load(next); }} />

      <Dialog isOpen={dialog.open} onClose={() => setDialog({ open: false })} title="Tạo phiếu xuất kho" size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Ngày xuất" type="datetime-local" value={form.export_date} onChange={(e) => setForm({ ...form, export_date: e.target.value })} required />
            <Select label="Trạm nhận" options={stations.map((station) => ({ value: String(station.id), label: `${station.ma_tram || `#${station.id}`} - ${station.owner_name || ''}`.trim() }))} value={form.charging_station_id} onChange={(e) => setForm({ ...form, charging_station_id: e.target.value })} placeholder="Chọn trạm" />
            {committedItems.length > 0 && (
              <div className="rounded-lg border border-base-300 bg-base-200/40 p-3 text-xs space-y-1">
                <div className="font-medium text-base-content/70">Số lượng đã chốt / tồn kho:</div>
                {committedItems.map((item) => {
                  const max = Math.min(item.committed_quantity, item.stock_quantity);
                  return (
                    <div key={item.pole_id} className="flex justify-between gap-2">
                      <span>{item.name} ({item.charging_type} {Number(item.power_kw)}kW)</span>
                      <span>chốt {item.committed_quantity} · tồn {item.stock_quantity} · tối đa {max}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Input label="Lý do xuất kho" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Chi tiết xuất</span>
              <Button variant="outline" size="xs" onClick={addRow}>Thêm dòng</Button>
            </div>
            {form.items.map((row, index) => (
              <div key={index} className="space-y-1">
                <div className="flex flex-col sm:flex-row gap-2 items-end">
                  <div className="flex-1 min-w-0">
                    <Select
                      label={index === 0 ? 'Trụ sạc' : undefined}
                      options={poles.map((pole) => ({ value: String(pole.id), label: `${pole.name} (${pole.charging_type} ${Number(pole.power_kw)}kW) - tồn ${pole.quantity}` }))}
                      value={row.pole_id}
                      onChange={(e) => updateRow(index, { pole_id: e.target.value })}
                      placeholder="Chọn trụ sạc"
                    />
                  </div>
                  <div className="w-full sm:w-32">
                    <Input label={index === 0 ? 'Số lượng' : undefined} type="number" min="1" value={row.quantity} onChange={(e) => updateRow(index, { quantity: e.target.value })} max={(() => { const committed = committedItems.find((item) => item.pole_id === Number(row.pole_id)); const pole = poles.find((p) => p.id === Number(row.pole_id)); if (!committed) return undefined; return Math.min(committed.committed_quantity, pole ? Number(pole.quantity) : 0); })()} />
                  </div>
                  <div className="w-full sm:w-auto">
                    {form.items.length > 1 && (
                      <Button variant="ghost" size="xs" onClick={() => removeRow(index)}>Xóa</Button>
                    )}
                  </div>
                </div>
                {(() => {
                  const committed = committedItems.find((item) => item.pole_id === Number(row.pole_id));
                  const pole = poles.find((p) => p.id === Number(row.pole_id));
                  if (!row.pole_id || !pole) return null;
                  const maxAllowed = committed ? Math.min(committed.committed_quantity, Number(pole.quantity)) : Number(pole.quantity);
                  if (Number(row.quantity) <= maxAllowed) return null;
                  return <div className="text-xs text-error">Tối đa {maxAllowed} trụ</div>;
                })()}
              </div>
            ))}
          </div>
          {(() => {
            const invalid = form.items.some((row) => {
              const committed = committedItems.find((item) => item.pole_id === Number(row.pole_id));
              if (!row.pole_id || !committed) return false;
              const pole = poles.find((p) => p.id === Number(row.pole_id));
              const maxAllowed = Math.min(committed.committed_quantity, pole ? Number(pole.quantity) : 0);
              return Number(row.quantity) > maxAllowed;
            });
            return invalid ? <div className="alert alert-error text-sm">Số lượng xuất vượt quá số lượng cho phép. Vui lòng kiểm tra lại.</div> : null;
          })()}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog({ open: false })} disabled={busy}>Hủy</Button>
            <Button loading={busy} onClick={save} disabled={busy || !form.charging_station_id || form.items.some((row) => {
              const pole = poles.find((p) => p.id === Number(row.pole_id));
              const committed = committedItems.find((item) => item.pole_id === Number(row.pole_id));
              if (!row.pole_id || !Number.isInteger(Number(row.pole_id)) || Number(row.pole_id) <= 0) return true;
              if (!Number.isInteger(Number(row.quantity)) || Number(row.quantity) <= 0) return true;
              const maxAllowed = committed ? Math.min(committed.committed_quantity, pole ? Number(pole.quantity) : 0) : (pole ? Number(pole.quantity) : 0);
              return Number(row.quantity) > maxAllowed;
            })}>Lưu phiếu xuất</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('vi-VN', { hour12: false });
};

export default AdminWarehousePage;
