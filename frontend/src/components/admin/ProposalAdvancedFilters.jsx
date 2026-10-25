import useFieldOptions from '../../hooks/useFieldOptions';

const ProposalAdvancedFilters = ({ values, onChange, options = {}, dateLabel = 'Ngày tạo đề xuất', statusOptions: statusOptionsProp = null }) => {
  const { getSelectOptions } = useFieldOptions('station_proposals', ['status', 'mo_hinh_dau_tu', 'province', 'vung_mien']);
  const statuses = statusOptionsProp || getSelectOptions('status');
  const models = getSelectOptions('mo_hinh_dau_tu').length ? getSelectOptions('mo_hinh_dau_tu') : (options.models || []);
  const provinces = getSelectOptions('province').length ? getSelectOptions('province') : (options.provinces || []);
  const regions = getSelectOptions('vung_mien').length ? getSelectOptions('vung_mien') : (options.regions || []);
  const selectClass = 'select select-bordered select-sm w-full';

  const setValue = (key) => (event) => onChange({ ...values, [key]: event.target.value });
  const renderOptions = (items, valueKey = 'value', labelKey = 'label') => {
    const uniqueItems = new Map();
    items.forEach((item) => {
      const value = item?.[valueKey] ?? item;
      const label = item?.[labelKey] ?? item;
      if (value !== null && value !== undefined && !uniqueItems.has(String(value))) {
        uniqueItems.set(String(value), { value, label });
      }
    });
    return [...uniqueItems].map(([key, item]) => (
      <option key={key} value={item.value}>{item.label}</option>
    ));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
      <select className={selectClass} value={values.proposalStatus || ''} onChange={setValue('proposalStatus')}>
        <option value="">Tất cả trạng thái đề xuất</option>
        {renderOptions(statuses)}
      </select>
      <select className={selectClass} value={values.model || ''} onChange={setValue('model')}>
        <option value="">Tất cả mô hình đầu tư</option>
        {renderOptions(models)}
      </select>
      <select className={selectClass} value={values.province || ''} onChange={setValue('province')}>
        <option value="">Tất cả tỉnh/thành</option>
        {renderOptions(provinces)}
      </select>
      <select className={selectClass} value={values.region || ''} onChange={setValue('region')}>
        <option value="">Tất cả miền</option>
        {renderOptions(regions)}
        {!regions.length && <>
          <option value="Bac">Miền Bắc</option>
          <option value="Trung">Miền Trung</option>
          <option value="Nam">Miền Nam</option>
        </>}
      </select>
      <select className={selectClass} value={values.ownerUserId || ''} onChange={setValue('ownerUserId')}>
        <option value="">Tất cả người đề xuất</option>
        {renderOptions(options.owners || [], 'id', 'name')}
      </select>
      <select className={selectClass} value={values.managerUserId || ''} onChange={setValue('managerUserId')}>
        <option value="">Tất cả người phụ trách</option>
        {renderOptions(options.managers || [], 'id', 'name')}
      </select>
      <label className="form-control w-full">
        <span className="label-text text-xs mb-1">{dateLabel} — từ ngày</span>
        <input className="input input-bordered input-sm" type="date" value={values.dateFrom || ''} onChange={setValue('dateFrom')} />
      </label>
      <label className="form-control w-full">
        <span className="label-text text-xs mb-1">{dateLabel} — đến ngày</span>
        <input className="input input-bordered input-sm" type="date" value={values.dateTo || ''} onChange={setValue('dateTo')} />
      </label>
    </div>
  );
};

export default ProposalAdvancedFilters;
