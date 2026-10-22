import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import ProposalGradingTab from '../../components/admin/ProposalGradingTab';
import { resolveGradingRole } from '../../utils/proposalGrading';

const TABS = [
  { key: 'all', label: 'Tất cả đề xuất' },
  { key: 'pending', label: 'Các đề xuất cần thực hiện' },
  { key: 'completed', label: 'Đề xuất đã hoàn thành' }
];

const AdminProposalsDanhGiaQuyHoachPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = ['all', 'pending', 'completed'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'all';

  const changeTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'all') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const isAdminLevel = !!user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  const gradingRole = resolveGradingRole(user?.department);
  const canGradeQH = isAdminLevel || gradingRole === 'QH';
  const canGradePL = isAdminLevel || gradingRole === 'PL';
  const defaultDepartment = gradingRole || '';

  return (
    <div>
      <PageHeader
        title="Đánh giá quy hoạch và Pháp lý"
        subtitle="Bước đánh giá quy hoạch, pháp lý của đề xuất trạm sạc"
      />

      <div role="tablist" className="tabs tabs-bordered mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className={`tab ${activeTab === tab.key ? 'tab-active' : ''}`}
            onClick={() => changeTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ProposalGradingTab
        tab={activeTab}
        canGradeQH={canGradeQH}
        canGradePL={canGradePL}
        defaultDepartment={defaultDepartment}
      />
    </div>
  );
};

export default AdminProposalsDanhGiaQuyHoachPage;
