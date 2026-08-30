import { useParams, useNavigate } from 'react-router-dom';
import FormBuilder from '../../components/admin/FormBuilder';

const AdminFormBuilderPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="admin-form-builder-page">
      <div className="page-header">
        <h1>{id ? 'Chỉnh sửa Form' : 'Tạo Form mới'}</h1>
      </div>
      <FormBuilder formId={id} onSaved={() => navigate('/admin/forms')} />
    </div>
  );
};

export default AdminFormBuilderPage;
