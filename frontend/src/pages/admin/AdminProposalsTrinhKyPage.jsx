import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import ProposalSignatureTab from '../../components/admin/ProposalSignatureTab';

const TABS = [
  { key: 'pending', label: 'Các đề xuất cần thực hiện' },
  { key: 'completed', label: 'Các đề xuất đã hoàn thành' },
  { key: 'all', label: 'Tất cả đề xuất' },
  { key: 'chairman', label: 'Đề xuất trình chủ tịch', backOfficeOnly: true }
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
        title="Trình ký"
      />

      <div className="space-y-3">
        <div role="tablist" className="proposal-workflow-tabs">
          {visibleTabs.map((tab) => (
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

        <ProposalSignatureTab tab={activeTab} onMeta={setMeta} />
      </div>
    </div>
  );
};

export default AdminProposalsTrinhKyPage;
