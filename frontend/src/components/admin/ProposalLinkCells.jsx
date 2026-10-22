import UserChip from '../dynamic/UserChip';

export const PROPOSAL_LINK_CLASS = 'link link-primary underline cursor-pointer text-left';

export const ProposalCodeLink = ({ id, code, onOpen }) => {
  if (!id) return <span className="field-empty">-</span>;
  return (
    <button
      type="button"
      className={PROPOSAL_LINK_CLASS}
      title="Xem chi tiết đề xuất"
      onClick={() => onOpen && onOpen(id)}
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
