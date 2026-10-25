import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import PageHeader from "../../components/ui/PageHeader";
import ProposalGradingTab from "../../components/admin/ProposalGradingTab";
import { resolveGradingRole } from "../../utils/proposalGrading";

const TABS = [
  { key: "all", label: "Tất cả đề xuất" },
  { key: "pending", label: "Các đề xuất cần thực hiện" },
  { key: "completed", label: "Đề xuất đã hoàn thành" },
];

const AdminProposalsDanhGiaQuyHoachPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = ["all", "pending", "completed"].includes(
    searchParams.get("tab"),
  )
    ? searchParams.get("tab")
    : "all";

  const changeTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "all") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isDepartmentAdmin = user?.role === "ADMIN";
  const gradingRole = resolveGradingRole(user?.department);
  const canGradeQH = isSuperAdmin || (isDepartmentAdmin && gradingRole === "QH");
  const canGradePL = isSuperAdmin || (isDepartmentAdmin && gradingRole === "PL");
  return (
    <div>
      <PageHeader title="Chấm điểm Quy hoạch và Pháp lý" />

      <div role="tablist" className="tabs tabs-bordered mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className={`tab ${activeTab === tab.key ? "tab-active" : ""}`}
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
      />
    </div>
  );
};

export default AdminProposalsDanhGiaQuyHoachPage;
