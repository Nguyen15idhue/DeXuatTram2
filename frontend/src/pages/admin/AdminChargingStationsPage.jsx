import PageHeader from '../../components/ui/PageHeader';
import ChargingStationTab from '../../components/admin/ChargingStationTab';
import ChargingStationContractTabs from '../../components/admin/ChargingStationContractTabs';
import ChargingStationInfrastructureTabs from '../../components/admin/ChargingStationInfrastructureTabs';
import ChargingStationDeliveryTabs from '../../components/admin/ChargingStationDeliveryTabs';
import ChargingStationProcessTabs from '../../components/admin/ChargingStationProcessTabs';
import { getStageConfig } from '../../utils/chargingStation';

const AdminChargingStationsPage = ({ stage = 'thong-tin-chung' }) => {
  const config = getStageConfig(stage);

  return (
    <div>
      <PageHeader title={config.title} subtitle="Quản lý ON trạm từ đề xuất đã ký" />
      {config.key === 'khoi-tao-hop-dong'
        ? <ChargingStationContractTabs />
        : config.key === 'xay-dung-ha-tang'
          ? <ChargingStationInfrastructureTabs />
          : config.key === 'giao-tru'
            ? <ChargingStationDeliveryTabs />
            : ['lap-tru', 'nghiem-thu', 'on-tram'].includes(config.key)
              ? <ChargingStationProcessTabs stage={config.key} />
              : <ChargingStationTab stage={config.key} />}
    </div>
  );
};

export default AdminChargingStationsPage;
