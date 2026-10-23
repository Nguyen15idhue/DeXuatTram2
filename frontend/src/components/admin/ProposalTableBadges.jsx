import { getStatusColor, getStatusLabel } from '../../utils/mapStatuses';
import { getModelLabel } from '../../utils/proposalGrading';

const BORDER_RADIUS = {
  square: '2px',
  'rounded-sm': '4px',
  rounded: '8px',
  'rounded-full': '9999px'
};

const FieldBadge = ({ label, color = '#666666', borderRadius = 'rounded' }) => {
  if (!label) return <span className="field-empty">-</span>;
  return (
    <span
      className="whitespace-nowrap"
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        fontSize: 12,
        fontWeight: 500,
        color: '#fff',
        backgroundColor: color,
        borderRadius: BORDER_RADIUS[borderRadius] || '8px'
      }}
    >
      {label}
    </span>
  );
};

export const PROPOSAL_VIEW_BUTTON_CLASS = 'btn btn-primary btn-xs gap-1 whitespace-nowrap';

export const ProposalStatusBadge = ({ value, optionMap }) => {
  if (!value) return <span className="field-empty">-</span>;
  const option = Array.isArray(optionMap)
    ? optionMap.find((item) => String(item.value) === String(value))
    : optionMap?.[value];
  return (
    <FieldBadge
      label={option?.label || getStatusLabel(value, 'proposal')}
      color={option?.color || getStatusColor(value, 'proposal') || '#666666'}
      borderRadius={option?.borderRadius}
    />
  );
};

export const ProposalModelBadge = ({ value, options }) => {
  if (!value) return <span className="field-empty">-</span>;
  const option = Array.isArray(options)
    ? options.find((item) => String(item.value) === String(value))
    : null;
  return (
    <FieldBadge
      label={option?.label || getModelLabel(value, options)}
      color={option?.color || '#666666'}
      borderRadius={option?.borderRadius}
    />
  );
};

export const ProposalColorBadge = ({ label, color, title }) => (
  <span title={title} className="whitespace-nowrap">
    <FieldBadge label={label} color={color} />
  </span>
);
