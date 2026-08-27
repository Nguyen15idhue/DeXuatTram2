const AdminDashboard = () => {
  return (
    <div className="admin-dashboard">
      <h1>Dashboard</h1>
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Users</h3>
          <p className="stat-number">-</p>
        </div>
        <div className="stat-card">
          <h3>Stations</h3>
          <p className="stat-number">-</p>
        </div>
        <div className="stat-card">
          <h3>Proposals</h3>
          <p className="stat-number">-</p>
        </div>
      </div>
      <p>Dashboard chi tiết sẽ được cập nhật ở Phase 9-11</p>
    </div>
  );
};

export default AdminDashboard;
