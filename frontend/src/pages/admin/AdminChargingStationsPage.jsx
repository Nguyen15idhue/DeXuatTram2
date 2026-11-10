import PageHeader from '../../components/ui/PageHeader';
import ChargingStationTab from '../../components/admin/ChargingStationTab';
import ChargingStationContractTabs from '../../components/admin/ChargingStationContractTabs';
import ChargingStationInfrastructureTabs from '../../components/admin/ChargingStationInfrastructureTabs';
import ChargingStationWorklist from '../../components/admin/ChargingStationWorklist';
import OnStationSheetSyncButton from '../../components/admin/OnStationSheetSyncButton';
import { getStageConfig } from '../../utils/chargingStation';

const AdminChargingStationsPage = ({ stage = 'thong-tin-chung' }) => {
  const config = getStageConfig(stage);
  const showSheetSync = ['thong-tin-chung', 'on-tram'].includes(config.key);

  return (
    <div>
      <PageHeader
        title={config.title}
        subtitle="Quản lý ON trạm từ đề xuất đã ký"
        actions={showSheetSync ? <OnStationSheetSyncButton /> : undefined}
      />
      {config.key === 'khoi-tao-hop-dong'
        ? <ChargingStationContractTabs />
        : config.key === 'xay-dung-ha-tang'
          ? <ChargingStationInfrastructureTabs />
          : config.key === 'giao-tru'
            ? <ChargingStationWorklist stage={config.key} />
            : ['lap-tru', 'nghiem-thu', 'on-tram'].includes(config.key)
              ? <ChargingStationWorklist stage={config.key} />
              : <ChargingStationTab stage={config.key} />}
    </div>
  );
};

export default AdminChargingStationsPage;
