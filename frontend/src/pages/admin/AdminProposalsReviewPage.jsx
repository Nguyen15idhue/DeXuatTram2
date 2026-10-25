import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import ProposalReviewTab from '../../components/admin/ProposalReviewTab';
import {
  resolveReviewRole
} from '../../utils/proposalReview';

const TABS = [
  { key: 'pending', label: 'Các đề xuất cần thực hiện' },
  { key: 'completed', label: 'Các đề xuất đã hoàn thành' },
  { key: 'all', label: 'Tất cả đề xuất' }
];

const AdminProposalsReviewPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = ['all', 'pending', 'completed'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'pending';

  const roleInfo = useMemo(() => resolveReviewRole(user), [user]);
  const effectiveRole = roleInfo.roleKey;
  const effectiveRegion = roleInfo.region;

  const changeTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'pending') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  if (!roleInfo.roleKey && !roleInfo.isAdmin) {
    return (
      <div>
        <PageHeader
          title="Yêu cầu chấm điểm lại"
          subtitle="Bước GĐTTKD xem xét, yêu cầu chấm lại và trình Tổng giám đốc"
        />
        <div className="alert alert-warning text-sm">
          Tài khoản của bạn không thuộc cấp xem xét (GĐTTKD, Phòng Quy hoạch, Phòng Pháp lý hoặc Tổng giám đốc).
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Yêu cầu chấm điểm lại"
        subtitle="GĐTTKD xem xét, yêu cầu chấm lại, trình Tổng giám đốc và theo dõi kết quả"
      />

      <div role="tablist" className="proposal-workflow-tabs mb-4">
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

      <ProposalReviewTab
        key={`${activeTab}-${effectiveRole}-${effectiveRegion}-${user?.role}`}
        tab={activeTab}
        roleKey={effectiveRole}
        isSuperAdmin={user?.role === 'SUPER_ADMIN'}
      />
    </div>
  );
};

export default AdminProposalsReviewPage;
