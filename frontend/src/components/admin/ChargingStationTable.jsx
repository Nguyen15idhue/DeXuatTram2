import { useMemo } from 'react';
import DynamicTable from '../dynamic/DynamicTable';
import UserChip from '../dynamic/UserChip';
import { getModelLabel } from '../../utils/proposalGrading';
import { formatChotTruRows } from '../../utils/proposalSignature';
import { ProposalProposerCell } from './ProposalLinkCells';

const personCell = (value) => value && typeof value === 'object' && value.id
  ? <UserChip value={value} />
  : <span>{value || '—'}</span>;

const proposalColumns = [
  { key: 'mo_hinh_dau_tu', label: 'Mô hình đầu tư', render: value => getModelLabel(value) },
  { key: 'chot_so_luong_tru', label: 'Quy mô trụ chốt', width: 240, render: value => formatChotTruRows(value) },
  { key: 'province', label: 'Tỉnh/Thành phố', render: value => value || '—' },
  { key: 'latitude', label: 'Vĩ độ', render: value => value ?? '—' },
  { key: 'longitude', label: 'Kinh độ', render: value => value ?? '—' },
  { key: 'nguoi_de_xuat', label: 'Người đề xuất', render: (value, row) => <ProposalProposerCell row={row} value={value} /> },
  { key: 'owner_department', label: 'Phòng ban đề xuất', width: 180, render: value => value || '—' },
  { key: 'nguoi_phu_trach', label: 'Người phụ trách', render: personCell },
  { key: 'nguoi_giao_phu_trach', label: 'Giám đốc TTKD', render: personCell }
];

const ChargingStationTable = ({
  columns,
  data = [],
  loading = false,
  emptyMessage = 'Không có trạm sạc',
  startIndex = 0,
  actions,
  frozenColumns = 3,
  showProposalColumns = false
}) => {
  const allColumns = useMemo(() => {
    if (!showProposalColumns) return columns;
    const keys = new Set(columns.map(column => column.key));
    return [...columns, ...proposalColumns.filter(column => !keys.has(column.key))];
  }, [columns, showProposalColumns]);
  const tableColumns = useMemo(() => allColumns.map((column) => ({
    key: column.key,
    label: column.label,
    type: 'text',
    visible: true,
    width: column.key === 'ma_tram' ? 110 : column.width || (column.key === 'address' ? 240 : column.key.endsWith('_at') ? 165 : 150)
  })), [allColumns]);
  const cellRenderers = useMemo(() => Object.fromEntries(allColumns.map((column) => [
    column.key,
    (row, value) => column.render ? column.render(value, row) : value
  ])), [allColumns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Đang tải danh sách trạm sạc">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!data.length) return <div className="rounded-lg border border-base-300 py-10 text-center text-sm text-base-content/50">{emptyMessage}</div>;

  return (
    <DynamicTable
      entity="charging_stations"
      columns={tableColumns}
      cellRenderers={cellRenderers}
      data={data}
      density="compact"
      frozenColumns={frozenColumns}
      startIndex={startIndex}
      showActions={!!actions}
      actions={actions}
    />
  );
};

export default ChargingStationTable;
