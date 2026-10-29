import PageHeader from '../../components/ui/PageHeader';
import ChargingStationTab from '../../components/admin/ChargingStationTab';
import { getStageConfig } from '../../utils/chargingStation';

const AdminChargingStationsPage = ({ stage = 'thong-tin-chung' }) => {
  const config = getStageConfig(stage);

  return (
    <div>
      <PageHeader title={config.title} subtitle="Quản lý ON trạm từ đề xuất đã ký" />
      <ChargingStationTab stage={config.key} />
    </div>
  );
};

export default AdminChargingStationsPage;
