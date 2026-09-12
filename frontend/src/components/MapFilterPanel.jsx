import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { getMarkerColor } from '../utils/mapHelpers';

const STATION_STATUSES = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'DEPLOYING', label: 'Đang triển khai' },
];

const PROPOSAL_STATUSES = [
  { value: 'PENDING', label: 'Đang đề xuất' },
  { value: 'REVIEWING', label: 'Đang xem xét' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Từ chối' },
];

export const EMPTY_MAP_FILTERS = {
  scope: 'all',
  stationStatuses: [],
  proposalStatuses: [],
  hideStations: false,
  hideProposals: false,
};

const toggleValue = (list, value) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

const MapFilterPanel = ({ filters, onChange, isMobile = false }) => {
  const [open, setOpen] = useState(false);
  const set = (patch) => onChange({ ...filters, ...patch });

  const activeCount = [
    filters.scope === 'mine' ? 1 : 0,
    filters.stationStatuses.length ? 1 : 0,
    filters.proposalStatuses.length ? 1 : 0,
    filters.hideStations || filters.hideProposals ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const renderStatusChips = (options, key) => (
    <div className="map-filter-chips">
      {options.map((s) => {
        const active = filters[key].includes(s.value);
        return (
          <button
            key={s.value}
            type="button"
            className={`map-filter-chip ${active ? 'active' : ''}`}
            onClick={() => set({ [key]: toggleValue(filters[key], s.value) })}
          >
            <span className="map-filter-dot" style={{ background: getMarkerColor(s.value) }} />
            {s.label}
          </button>
        );
      })}
    </div>
  );

  const body = (
    <div className="map-filter-body">
      <div className="map-filter-group">
        <span className="map-filter-label">Phạm vi đề xuất</span>
        <div className="map-filter-seg">
          <button type="button" className={filters.scope !== 'mine' ? 'active' : ''} onClick={() => set({ scope: 'all' })}>Tất cả</button>
          <button type="button" className={filters.scope === 'mine' ? 'active' : ''} onClick={() => set({ scope: 'mine' })}>Của tôi</button>
        </div>
      </div>

      <div className="map-filter-group">
        <span className="map-filter-label">Hiển thị</span>
        <div className="map-filter-checks">
          <label className="map-filter-check">
            <input type="checkbox" checked={!filters.hideStations} onChange={(e) => set({ hideStations: !e.target.checked })} />
            Trạm
          </label>
          <label className="map-filter-check">
            <input type="checkbox" checked={!filters.hideProposals} onChange={(e) => set({ hideProposals: !e.target.checked })} />
            Đề xuất
          </label>
        </div>
      </div>

      <div className="map-filter-group">
        <span className="map-filter-label">Trạng thái trạm</span>
        {renderStatusChips(STATION_STATUSES, 'stationStatuses')}
      </div>

      <div className="map-filter-group">
        <span className="map-filter-label">Trạng thái đề xuất</span>
        {renderStatusChips(PROPOSAL_STATUSES, 'proposalStatuses')}
      </div>

      <button type="button" className="btn btn-ghost btn-xs w-full" onClick={() => onChange({ ...EMPTY_MAP_FILTERS })}>
        Đặt lại bộ lọc
      </button>
    </div>
  );

  return (
    <div className={`map-filter ${isMobile ? 'map-filter-mobile' : ''}`}>
      <button
        type="button"
        className={`map-control-btn map-filter-toggle ${open ? 'map-control-btn-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Bộ lọc bản đồ"
      >
        <SlidersHorizontal size={16} />
        {activeCount > 0 && <span className="map-filter-count">{activeCount}</span>}
      </button>

      {open && (isMobile ? (
        <div className="map-filter-sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="map-filter-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="map-filter-sheet-handle" />
            <div className="map-filter-head">
              <span>Bộ lọc bản đồ</span>
              <button type="button" className="map-filter-close" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            {body}
          </div>
        </div>
      ) : (
        <div className="map-filter-card">
          <div className="map-filter-head">
            <span>Bộ lọc bản đồ</span>
            <button type="button" className="map-filter-close" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          {body}
        </div>
      ))}
    </div>
  );
};

export default MapFilterPanel;
