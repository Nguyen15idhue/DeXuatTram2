import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import ProposalReportTab from '../../components/admin/ProposalReportTab';

const TABS = [
  { key: 'pending', label: 'Các đề xuất cần thực hiện' },
  { key: 'completed', label: 'Các đề xuất đã hoàn thành' },
  { key: 'all', label: 'Tất cả đề xuất' }
];

const AdminProposalsLapToTrinhPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.some((tab) => tab.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'pending';

  const changeTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'pending') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Lập tờ trình BCĐX"
        subtitle="Lập tờ trình Ban Chỉ đạo Xây dựng cho đề xuất trạm sạc"
      />

      <div className="space-y-3">
        <div role="tablist" className="proposal-workflow-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className={`proposal-workflow-tab ${activeTab === tab.key ? 'is-active' : ''}`}
              onClick={() => changeTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ProposalReportTab tab={activeTab} />
      </div>
    </div>
  );
};

export default AdminProposalsLapToTrinhPage;
