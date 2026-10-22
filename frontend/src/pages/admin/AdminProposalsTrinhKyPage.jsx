import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import ProposalSignatureTab from '../../components/admin/ProposalSignatureTab';

const TABS = [
  { key: 'all', label: 'Tất cả đề xuất' },
  { key: 'pending', label: 'Đề xuất cần thực hiện' },
  { key: 'chairman', label: 'Đề xuất trình chủ tịch', backOfficeOnly: true },
  { key: 'completed', label: 'Đề xuất đã hoàn thành' }
];

const AdminProposalsTrinhKyPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [meta, setMeta] = useState({ isAdmin: false, isBackOffice: false, isManager: false });

  const canManage = !!(meta.isManager || meta.isAdmin || meta.isBackOffice);

  const visibleTabs = useMemo(
    () => TABS.filter((tab) => !tab.backOfficeOnly || canManage),
    [canManage]
  );

  const activeTab = visibleTabs.some((tab) => tab.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'all';

  const changeTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'all') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Trình ký"
        subtitle="Theo dõi và thực hiện ký duyệt tờ trình BCĐX"
      />

      <div className="space-y-3">
        <div role="tablist" className="tabs tabs-bordered">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className={`tab ${activeTab === tab.key ? 'tab-active font-semibold' : ''}`}
              onClick={() => changeTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ProposalSignatureTab tab={activeTab} onMeta={setMeta} />
      </div>
    </div>
  );
};

export default AdminProposalsTrinhKyPage;
