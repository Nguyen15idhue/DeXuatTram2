import { useParams, useNavigate } from 'react-router-dom';
import FormBuilder from '../../components/admin/FormBuilder';
import { ArrowLeft } from 'lucide-react';

const AdminFormBuilderPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button className="btn btn-ghost btn-sm gap-1" onClick={() => navigate('/admin/forms')}>
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-2xl font-bold">{id ? 'Chỉnh sửa Form' : 'Tạo Form mới'}</h1>
      </div>
      <FormBuilder formId={id} onSaved={() => navigate('/admin/forms')} />
    </div>
  );
};

export default AdminFormBuilderPage;
