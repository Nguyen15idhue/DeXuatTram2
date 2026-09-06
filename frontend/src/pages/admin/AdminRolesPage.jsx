const MATRIX = [
  { resource: 'Users (xem cây)', superAdmin: 'Toàn hệ thống', admin: 'Toàn hệ thống', sales: 'Nhánh mình', ctv: 'Không' },
  { resource: 'Users (tạo)', superAdmin: 'Mọi role', admin: 'Trừ Super Admin', sales: 'Chỉ CTV', ctv: 'Không' },
  { resource: 'Users (sửa/xóa)', superAdmin: 'Tất cả', admin: 'Trừ Super Admin', sales: 'CTV nhánh mình', ctv: 'Không' },
  { resource: 'Stations (xem)', superAdmin: 'Tất cả', admin: 'Tất cả', sales: 'Tất cả', ctv: 'Không (trang user)' },
  { resource: 'Stations (thêm/sửa/xóa)', superAdmin: 'Có', admin: 'Có', sales: 'Không', ctv: 'Không' },
  { resource: 'Proposals (xem/quản lý)', superAdmin: 'Toàn hệ thống', admin: 'Toàn hệ thống', sales: 'Nhánh mình', ctv: 'Của mình (trang user)' },
  { resource: 'Proposals (duyệt status)', superAdmin: 'Có', admin: 'Có', sales: 'Trong nhánh', ctv: 'Không' },
  { resource: 'Dashboard', superAdmin: 'Toàn hệ thống', admin: 'Toàn hệ thống', sales: 'Nhánh mình', ctv: 'Không' },
  { resource: 'Cấu hình (fields/forms/views/data-lists/map-config)', superAdmin: 'Có', admin: 'Không', sales: 'Không', ctv: 'Không' },
  { resource: 'Phân quyền (trang này)', superAdmin: 'Xem', admin: 'Không', sales: 'Không', ctv: 'Không' },
];

const AdminRolesPage = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-base-content">Ma trận phân quyền</h1>
      <p className="text-sm text-base-content/60">Chỉ Super Admin xem được trang này. Chỉnh sửa ma trận thực hiện ở phase sau.</p>
      <div className="overflow-x-auto bg-base-100 rounded-lg border border-base-300">
        <table className="table table-zebra w-full text-sm">
          <thead>
            <tr>
              <th>Tài nguyên</th>
              <th>Super Admin</th>
              <th>Admin</th>
              <th>Sales</th>
              <th>CTV</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row) => (
              <tr key={row.resource}>
                <td className="font-medium">{row.resource}</td>
                <td>{row.superAdmin}</td>
                <td>{row.admin}</td>
                <td>{row.sales}</td>
                <td>{row.ctv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminRolesPage;
