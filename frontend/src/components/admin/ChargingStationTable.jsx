import { useMemo } from 'react';
import DynamicTable from '../dynamic/DynamicTable';

const ChargingStationTable = ({
  columns,
  data = [],
  loading = false,
  emptyMessage = 'Không có trạm sạc',
  startIndex = 0,
  actions,
  frozenColumns = 3
}) => {
  const tableColumns = useMemo(() => columns.map((column) => ({
    key: column.key,
    label: column.label,
    type: 'text',
    visible: true,
    width: column.width || (column.key === 'address' ? 240 : column.key.endsWith('_at') ? 165 : 150)
  })), [columns]);
  const cellRenderers = useMemo(() => Object.fromEntries(columns.map((column) => [
    column.key,
    (row, value) => column.render ? column.render(value, row) : value
  ])), [columns]);

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
