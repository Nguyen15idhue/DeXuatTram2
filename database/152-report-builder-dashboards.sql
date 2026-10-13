-- 152: Bang dashboard tu dung (mini-builder bao cao, G8 Z-P4, docs/8/69-Z).
-- layout_json: {widgets: [{dataset, dimension, metric, agg, filters[], sort, limit, title, chart, size}]}.
-- Widget duoc bien dich thanh SQL mau whitelist phia server (reportBuilderService) — KHONG luu SQL.
-- Idempotent: CREATE IF NOT EXISTS. KHONG dung DROP.

CREATE TABLE IF NOT EXISTS report_builder_dashboards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  layout_json JSON NOT NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_builder_dashboard_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT COUNT(*) AS builder_dashboards FROM report_builder_dashboards;
