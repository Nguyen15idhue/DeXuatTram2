import PageHeader from "../../components/ui/PageHeader";

const AdminProposalsLapToTrinhPage = () => {
  return (
    <div>
      <PageHeader title="Lập tờ trình BCĐX" subtitle="Lập tờ trình Ban Chỉ đạo Xây dựng cho đề xuất trạm sạc" />
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h2 className="card-title text-base">Chức năng đang được xây dựng</h2>
          <p className="text-sm text-base-content/70">
            Trang này sẽ hiển thị danh sách đề xuất cần lập tờ trình BCĐX.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminProposalsLapToTrinhPage;
