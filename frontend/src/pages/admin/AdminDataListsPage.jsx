import { useParams } from 'react-router-dom';
import DataListManager from '../../components/admin/DataListManager';
import DataListEditor from '../../components/admin/DataListEditor';

const AdminDataListsPage = () => {
  const { id } = useParams();
  return id ? <DataListEditor /> : <DataListManager />;
};

export default AdminDataListsPage;
