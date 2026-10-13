-- 151: Bang cau hinh dashboard bao cao (SUPER_ONLY sua, G2 Phase 9.2).
-- layout_json: mang [{metric, title, chart, size, order}]. Chi cau hinh layout, KHONG cau hinh SQL.
-- Idempotent: CREATE IF NOT EXISTS + seed bang WHERE NOT EXISTS. KHONG dung DROP.

CREATE TABLE IF NOT EXISTS report_dashboard_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dashboard_key VARCHAR(50) NOT NULL,
  layout_json JSON NOT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dashboard (dashboard_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO report_dashboard_configs (dashboard_key, layout_json)
SELECT 'pipeline', '[{"metric":"lead_funnel","title":"Phễu Lead → ON","chart":"funnel","size":"full","order":1},{"metric":"conversion_rates","title":"Tỉ lệ chuyển đổi","chart":"kpi","size":"md","order":2},{"metric":"lead_by_stage","title":"Lead theo stage","chart":"bar","size":"md","order":3},{"metric":"lead_by_source","title":"Lead theo nguồn","chart":"pie","size":"sm","order":4},{"metric":"lead_by_classification","title":"Lead theo phân loại","chart":"pie","size":"sm","order":5},{"metric":"lead_by_province","title":"Lead theo tỉnh","chart":"bar","size":"md","order":6},{"metric":"lead_by_region","title":"Lead theo vùng","chart":"pie","size":"sm","order":7},{"metric":"lead_by_department","title":"Lead theo phòng ban","chart":"bar","size":"md","order":8},{"metric":"lead_by_assignee","title":"Lead theo người phụ trách","chart":"table","size":"md","order":9},{"metric":"proposal_by_status","title":"Đề xuất theo trạng thái","chart":"bar","size":"md","order":10},{"metric":"average_duration","title":"Thời gian trung bình","chart":"kpi","size":"sm","order":11},{"metric":"pipeline_over_time","title":"Pipeline theo thời gian","chart":"line","size":"full","order":12},{"metric":"stuck_items","title":"Kẹt hạn","chart":"table","size":"full","order":13},{"metric":"unassigned_leads","title":"Lead chưa phân công","chart":"table","size":"md","order":14},{"metric":"proposals_without_lead","title":"Đề xuất không gắn Lead","chart":"table","size":"sm","order":15},{"metric":"stations_without_proposal","title":"Trạm không gắn đề xuất","chart":"table","size":"sm","order":16},{"metric":"journey_sync_errors","title":"Lỗi đồng bộ","chart":"table","size":"sm","order":17}]'
WHERE NOT EXISTS (SELECT 1 FROM report_dashboard_configs WHERE dashboard_key = 'pipeline');

SELECT id, dashboard_key, updated_at FROM report_dashboard_configs ORDER BY id;
