import PageHeader from "../../components/ui/PageHeader";

const AdminProposalsDanhGiaLayoutPage = () => {
  return (
    <div>
      <PageHeader title="Đánh giá layout" subtitle="Bước đánh giá layout trạm sạc của đề xuất" />
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h2 className="card-title text-base">Chức năng đang được xây dựng</h2>
          <p className="text-sm text-base-content/70">
            Trang này sẽ hiển thị danh sách đề xuất cần đánh giá layout.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminProposalsDanhGiaLayoutPage;
