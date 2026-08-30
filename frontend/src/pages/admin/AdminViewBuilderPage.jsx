import { useParams, useNavigate } from 'react-router-dom';
import ViewBuilder from '../../components/admin/ViewBuilder';

const AdminViewBuilderPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="admin-view-builder-page">
      <div className="page-header">
        <h1>{id ? 'Chỉnh sửa View' : 'Tạo View mới'}</h1>
      </div>
      <ViewBuilder viewId={id} onSaved={() => navigate('/admin/views')} />
    </div>
  );
};

export default AdminViewBuilderPage;
