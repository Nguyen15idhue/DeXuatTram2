import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import RecordDetailPopup from '../admin/RecordDetailPopup';

const resolveUserId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const raw = (typeof value === 'object' && value !== null) ? (value.id ?? value.user_id ?? value.value) : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const resolveLabel = (value) => {
  if (value && typeof value === 'object' && value.label) return String(value.label);
  return '';
};

const USERS_VIEW_ID = 7;

const UserChip = ({ value }) => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const uid = resolveUserId(value);
  const label = resolveLabel(value) || (uid ? `User #${uid}` : '');
  if (!uid) return <span className="field-empty">-</span>;
  const canView = !!user && ['SUPER_ADMIN', 'ADMIN', 'SALES'].includes(user.role);
  if (!canView) return <span>{label}</span>;
  return (
    <>
      <button
        type="button"
        className="link link-primary"
        style={{ fontSize: 12 }}
        title="Xem chi tiết người dùng"
        onClick={() => setShow(true)}
      >
        {label}
      </button>
      {show && (
        <RecordDetailPopup
          entity="users"
          recordId={uid}
          viewId={USERS_VIEW_ID}
          mode="view"
          onClose={() => setShow(false)}
        />
      )}
    </>
  );
};

export default UserChip;
