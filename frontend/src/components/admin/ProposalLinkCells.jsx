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
