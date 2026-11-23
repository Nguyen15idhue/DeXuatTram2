import { useNavigate } from 'react-router-dom';
import UserChip from '../dynamic/UserChip';

export const PROPOSAL_LINK_CLASS = 'link link-primary underline cursor-pointer text-left';

export const ProposalCodeLink = ({ id, code, to }) => {
  const navigate = useNavigate();

  if (!id) return <span className="field-empty">-</span>;
  return (
    <button
      type="button"
      className={PROPOSAL_LINK_CLASS}
      title="Xem chi tiết đề xuất"
      onClick={() => navigate(to || `/admin/proposals/chi-tiet/${id}`)}
    >
      {code || `#${id}`}
    </button>
  );
};

export const ProposalPersonLink = ({ id, name }) => {
  if (!id) return <span className="field-empty">-</span>;
  return (
    <UserChip
      value={{ id, label: name || `User #${id}` }}
      linkClassName={PROPOSAL_LINK_CLASS}
    />
  );
};

export const ProposalProposerCell = ({ row, value }) => {
  const raw = value && typeof value === 'object'
    ? (value.id ?? value.user_id ?? value.value)
    : value;
  const id = Number(raw);
  if (Number.isInteger(id) && id > 0) {
    return <ProposalPersonLink id={id} name={typeof value === 'object' ? value.label : ''} />;
  }
  const label = typeof value === 'string' ? value.trim() : value?.label;
  if (label) return <span>{label}</span>;
  return row.user_id
    ? <ProposalPersonLink id={row.user_id} name={row.user_name} />
    : <span>Khách</span>;
};
