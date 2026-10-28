import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import { getProposalAddress } from '../../utils/proposalGrading';
import { resolveRegion, REGION_LABELS } from '../../utils/proposalReview';
import { ProposalPersonLink } from './ProposalLinkCells';

export const PROPOSAL_CONTEXT_COLUMNS = [
  { key: 'owner_department', field_key: 'owner_department', label: 'Phòng ban đề xuất', width: 180, sortable: false, filterable: false, visible: true },
  { key: 'vung_mien', field_key: 'vung_mien', label: 'Miền đề xuất', width: 120, sortable: false, filterable: false, visible: true },
  { key: 'manager_name', field_key: 'manager_name', label: 'Người phụ trách', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'province', field_key: 'province', label: 'Tỉnh/Thành phố', width: 150, sortable: false, filterable: false, visible: true },
  { key: 'address', field_key: 'address', label: 'Địa chỉ chi tiết', width: 240, sortable: false, filterable: false, visible: true }
];

export const PROPOSAL_HIDDEN_COLUMN_KEYS = [
  'submission_source',
  'he_thong_nguon',
  'loai_uu_tien',
  'review_level',
  'vung_mien',
  'nguon_dien',
  'manager_name'
];
export const PROPOSAL_HIDDEN_COLUMN_LABELS = [
  'Hệ thống nguồn',
  'Loại ưu tiên',
  'Mức độ xem xét',
  'Miền đề xuất',
  'Nguồn điện',
  'Người phụ trách'
];

export const PROPOSAL_SCALE_COLUMN = {
  key: 'scale',
  field_key: 'scale',
  label: 'Quy mô trụ',
  width: 240,
  sortable: false,
  filterable: false,
  visible: true
};

export const PROPOSAL_MONEY_COLUMN_KEYS = [
  'cost',
  'investment_cost',
  'tong_chi_phi',
  'tong_gia_tri_chot'
];

export const ProposalManagerCell = ({ row }) => (
  <ProposalPersonLink id={row.manager_user_id} name={row.manager_name} />
);

export const ProposalRegionCell = ({ value }) => {
  const region = resolveRegion(value);
  return <span>{region ? REGION_LABELS[region] : '-'}</span>;
};

export const ProposalProvinceCell = ({ value }) => <span>{value || '-'}</span>;

export const ProposalAddressCell = ({ row, value }) => {
  const address = value || getProposalAddress(row);
  const tooltipId = useId();
  const triggerRef = useRef(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!active || !triggerRef.current) return undefined;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const showBelow = rect.bottom + 12 + 72 < window.innerHeight;
      setPosition({
        left,
        top: showBelow ? rect.bottom + 8 : Math.max(12, rect.top - 8),
        transform: showBelow ? 'none' : 'translateY(-100%)',
        maxWidth: width
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [active, address]);

  if (!address || address === '-') return <span className="text-base-content/50">-</span>;

  return (
    <>
      <span
        ref={triggerRef}
        className="block max-w-[220px] truncate"
        tabIndex={0}
        aria-label={`Địa chỉ chi tiết: ${address}`}
        aria-describedby={active ? tooltipId : undefined}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
      >
        {address}
      </span>
      {active && position && createPortal(
        <span
          id={tooltipId}
          role="tooltip"
          className="proposal-address-tooltip"
          style={position}
        >
          {address}
        </span>,
        document.body
      )}
    </>
  );
};
