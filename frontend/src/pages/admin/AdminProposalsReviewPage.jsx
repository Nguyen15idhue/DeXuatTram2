import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import ProposalReviewTab from '../../components/admin/ProposalReviewTab';
import {
  REGION_LABELS,
  REVIEW_ROLE,
  REVIEW_ROLE_LABELS,
  resolveReviewRole
} from '../../utils/proposalReview';

const TABS = [
  { key: 'all', label: 'Tất cả đề xuất' },
  { key: 'pending', label: 'Các đề xuất cần thực hiện' },
  { key: 'completed', label: 'Đề xuất đã hoàn thành' }
];

const ROLE_OPTIONS = [
  { value: '', label: 'Tất cả vai trò' },
  { value: REVIEW_ROLE.GDTTKD, label: REVIEW_ROLE_LABELS.GDTTKD },
  { value: REVIEW_ROLE.QH, label: REVIEW_ROLE_LABELS.QH },
  { value: REVIEW_ROLE.PL, label: REVIEW_ROLE_LABELS.PL },
  { value: REVIEW_ROLE.TGD, label: REVIEW_ROLE_LABELS.TGD }
];

const AdminProposalsReviewPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = ['all', 'pending', 'completed'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'all';

  const roleInfo = useMemo(() => resolveReviewRole(user), [user]);
  const isAdminLevel = !!roleInfo.isAdmin;
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');

  const effectiveRole = isAdminLevel ? (selectedRole || REVIEW_ROLE.ADMIN) : roleInfo.roleKey;
  const effectiveRegion = isAdminLevel
    ? (selectedRole === REVIEW_ROLE.GDTTKD ? selectedRegion : '')
    : roleInfo.region;

  const changeTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'all') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const roleLabel = effectiveRole === REVIEW_ROLE.ADMIN
    ? 'Tất cả vai trò'
    : `${REVIEW_ROLE_LABELS[effectiveRole] || effectiveRole}${effectiveRegion ? ` · ${REGION_LABELS[effectiveRegion] || effectiveRegion}` : ''}`;

  if (!isAdminLevel && !roleInfo.roleKey) {
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

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="badge badge-outline badge-lg gap-1">
          Vai trò xử lý: <b>{roleLabel}</b>
        </div>
        {isAdminLevel && (
          <>
            <label className="flex items-center gap-1 text-sm">
              <span className="whitespace-nowrap">Xem theo vai trò:</span>
              <select
                className="select select-bordered select-sm"
                value={selectedRole}
                onChange={(event) => {
                  setSelectedRole(event.target.value);
                  if (event.target.value !== REVIEW_ROLE.GDTTKD) setSelectedRegion('');
                }}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {selectedRole === REVIEW_ROLE.GDTTKD && (
              <label className="flex items-center gap-1 text-sm">
                <span className="whitespace-nowrap">Miền:</span>
                <select
                  className="select select-bordered select-sm"
                  value={selectedRegion}
                  onChange={(event) => setSelectedRegion(event.target.value)}
                >
                  <option value="">Tất cả miền</option>
                  <option value="Bac">{REGION_LABELS.Bac}</option>
                  <option value="Trung">{REGION_LABELS.Trung}</option>
                  <option value="Nam">{REGION_LABELS.Nam}</option>
                </select>
              </label>
            )}
          </>
        )}
      </div>

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

      <ProposalReviewTab
        key={`${activeTab}-${effectiveRole}-${effectiveRegion}`}
        tab={activeTab}
        reviewRole={isAdminLevel ? selectedRole : ''}
        region={isAdminLevel && selectedRole === REVIEW_ROLE.GDTTKD ? selectedRegion : ''}
        roleKey={effectiveRole}
        isAdmin={isAdminLevel}
      />
    </div>
  );
};

export default AdminProposalsReviewPage;
