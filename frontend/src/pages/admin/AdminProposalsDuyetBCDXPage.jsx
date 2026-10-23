import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import ProposalApprovalTab from "../../components/admin/ProposalApprovalTab";

const TABS = [
  { key: "all", label: "Tất cả đề xuất" },
  { key: "pending", label: "Các đề xuất cần thực hiện" },
  { key: "updating", label: "Đề xuất đang chờ bổ sung thông tin" },
  { key: "completed", label: "Đề xuất đã hoàn thành" },
];

const AdminProposalsDuyetBCDXPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.some((tab) => tab.key === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "all";

  const changeTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "all") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Duyệt BCĐX"
        subtitle="Back Office xem xét tờ trình BCĐX và cấu hình trình ký"
      />

      <div className="space-y-3">
        <div role="tablist" className="tabs tabs-bordered">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className={`tab ${activeTab === tab.key ? "tab-active font-semibold" : ""}`}
              onClick={() => changeTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ProposalApprovalTab tab={activeTab} />
      </div>
    </div>
  );
};

export default AdminProposalsDuyetBCDXPage;
