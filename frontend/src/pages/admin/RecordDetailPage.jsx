import { useParams, useNavigate, useLocation } from 'react-router-dom';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';

const ENTITY_MAP = {
  stations: 'stations',
  users: 'users',
  proposals: 'station_proposals'
};

const RecordDetailPage = () => {
  const { entity, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const isEdit = location.pathname.includes('/edit=');
  const mode = isEdit ? 'edit' : 'view';

  const handleClose = () => {
    navigate(`/admin/${entity}`);
  };

  return (
    <RecordDetailPopup
      entity={ENTITY_MAP[entity] || entity}
      recordId={parseInt(id)}
      mode={mode}
      onClose={handleClose}
      onSaved={handleClose}
      onSwitchMode={(newMode) => {
        const action = newMode === 'edit' ? 'edit' : 'view';
        navigate(`/admin/${entity}/${action}=${id}`, { replace: true });
      }}
    />
  );
};

export default RecordDetailPage;
