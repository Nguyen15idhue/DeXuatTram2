import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import ProposalLayoutTab from '../../components/admin/ProposalLayoutTab';
import { canManageLayout } from '../../utils/proposalDesign';
import { ShieldAlert } from 'lucide-react';

const TABS = [
  { key: 'all', label: 'Tất cả đề xuất' },
  { key: 'pending', label: 'Đề xuất cần thực hiện' },
  { key: 'waiting', label: 'Đề xuất đang chờ bổ sung' },
  { key: 'layout', label: 'Đề xuất đã có bản vẽ layout' }
];

const AdminProposalsDanhGiaLayoutPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.some((tab) => tab.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'all';

  const canManage = canManageLayout(user);

  const changeTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'all') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Đánh giá layout"
        subtitle="Tải bản vẽ layout, duyệt layout và yêu cầu người đề xuất bổ sung thông tin"
      />

      {!canManage ? (
        <div className="alert alert-warning">
          <ShieldAlert size={20} />
          <span>
            Chỉ thành viên Phòng Công nghệ và Quy hoạch (hoặc Admin/Super Admin) được xem và xử lý
            bước đánh giá layout.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <div role="tablist" className="tabs tabs-bordered">
            {TABS.map((tab) => (
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

          <ProposalLayoutTab tab={activeTab} canManage={canManage} />
        </div>
      )}
    </div>
  );
};

export default AdminProposalsDanhGiaLayoutPage;
