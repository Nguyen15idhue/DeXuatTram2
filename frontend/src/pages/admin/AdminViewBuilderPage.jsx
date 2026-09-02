import { useParams, useNavigate } from 'react-router-dom';
import ViewBuilder from '../../components/admin/ViewBuilder';
import { ArrowLeft } from 'lucide-react';

const AdminViewBuilderPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button className="btn btn-ghost btn-sm gap-1" onClick={() => navigate('/admin/views')}>
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-2xl font-bold">{id ? 'Chỉnh sửa View' : 'Tạo View mới'}</h1>
      </div>
      <ViewBuilder viewId={id} onSaved={() => navigate('/admin/views')} />
    </div>
  );
};

export default AdminViewBuilderPage;
