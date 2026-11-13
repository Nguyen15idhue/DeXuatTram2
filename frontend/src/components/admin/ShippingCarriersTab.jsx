import { useCallback, useEffect, useRef, useState } from 'react';
import { shippingCarrierService } from '../../services/api';
import { Badge, Button, ConfirmDialog, DataTable, Dialog, Input } from '../ui';

const ShippingCarriersTab = ({ token }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await shippingCarrierService.list(token)).data || []); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  const save = async event => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await shippingCarrierService.save(form.id, { name: form.name, note: form.note, active: form.active }, token);
      setForm(null);
      await load();
    } catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await shippingCarrierService.remove(deleting.id, token);
      setDeleting(null);
      await load();
    } catch (failure) { setError(failure.message); setDeleting(null); }
    finally { saving.current = false; setBusy(false); }
  };
  return <div className="space-y-3">
    {error && <div role="alert" className="alert alert-error">{error}</div>}
    <div className="flex justify-end"><Button onClick={() => { setError(''); setForm({ name: '', note: '', active: true }); }}>Thêm đơn vị vận chuyển</Button></div>
    <DataTable data={items} loading={loading} columns={[
      { key: 'name', label: 'Đơn vị vận chuyển' }, { key: 'note', label: 'Ghi chú' },
      { key: 'active', label: 'Trạng thái', render: value => <Badge variant={value ? 'success' : 'ghost'}>{value ? 'Hoạt động' : 'Ngừng hoạt động'}</Badge> }
    ]} actions={row => <div className="flex gap-2">
      <Button size="xs" variant="outline" onClick={() => { setError(''); setForm({ ...row, active: Boolean(row.active), note: row.note || '' }); }}>Sửa</Button>
      <Button size="xs" variant="outline-error" disabled={Boolean(row.used)} title={row.used ? 'Đã sử dụng, chỉ được ngừng hoạt động' : ''}
        onClick={() => setDeleting(row)}>Xóa</Button>
    </div>} />
    <Dialog isOpen={!!form} onClose={() => !busy && setForm(null)} title={form?.id ? 'Sửa đơn vị vận chuyển' : 'Thêm đơn vị vận chuyển'}>
      {form && <form onSubmit={save} className="space-y-3">
        <Input label="Tên đơn vị vận chuyển" required maxLength={255} disabled={busy} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
        <Input label="Ghi chú" maxLength={5000} disabled={busy} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} />
        <label className="flex gap-2"><input type="checkbox" className="checkbox checkbox-sm" checked={form.active} disabled={busy}
          onChange={event => setForm({ ...form, active: event.target.checked })} />Đang hoạt động</label>
        {error && <div role="alert" className="text-error">{error}</div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setForm(null)}>Hủy</Button>
          <Button type="submit" loading={busy} disabled={busy || !form.name.trim()}>Lưu</Button></div>
      </form>}
    </Dialog>
    <ConfirmDialog isOpen={!!deleting} title="Xóa đơn vị vận chuyển" message={`Xóa ${deleting?.name || ''}?`}
      onConfirm={remove} onCancel={() => !busy && setDeleting(null)} />
  </div>;
};

export default ShippingCarriersTab;
