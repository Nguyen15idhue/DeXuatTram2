import PageHeader from '../../components/ui/PageHeader';

const AdminComingSoonPage = ({ title }) => (
  <div>
    <PageHeader title={title} />
    <div className="rounded-xl border border-dashed border-base-300 bg-base-100 p-10 text-center text-base-content/60">
      Chức năng đang được phát triển. Phạm vi sẽ được xác nhận ở giai đoạn sau.
    </div>
  </div>
);

export default AdminComingSoonPage;
