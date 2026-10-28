import { useState } from 'react';
import { MapPinned } from 'lucide-react';
import LocationMapModal from '../LocationMapModal';

const parseCoordinate = (value) => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
};

const ProposalLocationMapButton = ({ proposal }) => {
  const [open, setOpen] = useState(false);
  const latitude = parseCoordinate(proposal?.latitude);
  const longitude = parseCoordinate(proposal?.longitude);
  const hasCoordinates = latitude !== null
    && longitude !== null
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
  const proposalLabel = proposal?.ma_de_xuat || `#${proposal?.id}`;

  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm gap-1"
        onClick={() => setOpen(true)}
        disabled={!hasCoordinates}
        title={hasCoordinates ? 'Xem bản đồ và các địa điểm xung quanh' : 'Đề xuất chưa có tọa độ hợp lệ'}
      >
        <MapPinned size={15} />
        Xem bản đồ
      </button>
      {open && hasCoordinates && (
        <LocationMapModal
          open
          lat={latitude}
          lng={longitude}
          title={`Đề xuất ${proposalLabel}`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

export default ProposalLocationMapButton;
