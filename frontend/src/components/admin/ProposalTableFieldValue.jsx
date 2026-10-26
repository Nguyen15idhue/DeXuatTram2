import FieldRenderer from '../dynamic/FieldRenderer';
import { getFieldValue, parseProposalTableRows } from '../../utils/proposalGrading';

const ProposalTableFieldValue = ({ record, field }) => {
  const value = getFieldValue(record, field.key);
  const rows = parseProposalTableRows(value);
  const sourceConfig = (() => {
    if (!field.source_config || typeof field.source_config === 'object') return field.source_config || {};
    try {
      return JSON.parse(field.source_config);
    } catch {
      return {};
    }
  })();
  const displayField = {
    ...field,
    source_config: {
      ...sourceConfig,
      columns: (Array.isArray(sourceConfig.columns) ? sourceConfig.columns : []).map((column) => {
        if (!column || typeof column !== 'object') return column;
        return ['so_tien', 'don_gia', 'thanh_tien'].includes(column.key)
          ? { ...column, unit: column.unit || '₫' }
          : column;
      })
    }
  };

  if (rows.length > 0) {
    return (
      <FieldRenderer
        field={displayField}
        value={rows}
        entity="station_proposals"
        entityId={record?.id}
        expandTable
      />
    );
  }

  if (value === null || value === undefined || value === '') {
    return <span className="text-base-content/50">—</span>;
  }

  if ((Array.isArray(value) && value.length === 0) || value === '[]') {
    return <span className="text-base-content/50">Chưa có dữ liệu</span>;
  }

  return (
    <div className="alert alert-warning py-2 text-sm">
      Không thể hiển thị bảng do dữ liệu không đúng định dạng.
    </div>
  );
};

export default ProposalTableFieldValue;
