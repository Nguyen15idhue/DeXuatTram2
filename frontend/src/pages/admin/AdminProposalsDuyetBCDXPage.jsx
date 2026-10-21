import PageHeader from "../../components/ui/PageHeader";

const AdminProposalsDuyetBCDXPage = () => {
  return (
    <div>
      <PageHeader title="Duyệt BCĐX" subtitle="Duyệt tờ trình Ban Chỉ đạo Xây dựng" />
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h2 className="card-title text-base">Chức năng đang được xây dựng</h2>
          <p className="text-sm text-base-content/70">
            Trang này sẽ hiển thị danh sách tờ trình chờ Ban Chỉ đạo Xây dựng phê duyệt.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminProposalsDuyetBCDXPage;
