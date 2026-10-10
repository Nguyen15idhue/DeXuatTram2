-- 160: cau hinh node dac biet (tab Cau hinh node dac biet): global 1 bo cho moi automation.
CREATE TABLE IF NOT EXISTS automation_special_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_key VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  fields JSON DEFAULT NULL,
  config JSON DEFAULT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  deletable TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2 node mac dinh: contact (fields dung dong tu form) + latest_status (9 nhom theo template).
-- Moi muc trong nhom: {node, field} (field mac dinh status).
INSERT INTO automation_special_nodes (node_key, title, fields, config, is_default, deletable)
SELECT 'contact', 'Liên hệ gắn với quy trình', NULL, NULL, 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM automation_special_nodes WHERE node_key = 'contact');

INSERT INTO automation_special_nodes (node_key, title, fields, config, is_default, deletable)
SELECT 'latest_status', 'Trạng thái mới nhất',
  JSON_ARRAY(JSON_OBJECT('path', 'latest_status.value', 'label', 'Trạng thái cuối cùng')),
  JSON_OBJECT('groups', JSON_ARRAY(
    JSON_OBJECT('action', 'Chấm điểm', 'template', '[EGR] Quy trình đánh giá đầu tư', 'members', JSON_ARRAY(JSON_OBJECT('node', 'n19', 'field', 'status'), JSON_OBJECT('node', 'n21', 'field', 'status'), JSON_OBJECT('node', 'n22', 'field', 'status')), 'exclude', JSON_ARRAY()),
    JSON_OBJECT('action', 'GDTTKD đánh giá', 'template', '[EGR] Quy trình đánh giá đầu tư', 'members', JSON_ARRAY(JSON_OBJECT('node', 'n54', 'field', 'status')), 'exclude', JSON_ARRAY()),
    JSON_OBJECT('action', 'Giải trình ĐX', 'template', '[EGR] Quy trình đánh giá đầu tư', 'members', JSON_ARRAY(JSON_OBJECT('node', 'n32', 'field', 'status')), 'exclude', JSON_ARRAY()),
    JSON_OBJECT('action', 'TGĐ duyệt Giải trình', 'template', '[EGR] Quy trình đánh giá đầu tư', 'members', JSON_ARRAY(JSON_OBJECT('node', 'n38', 'field', 'status')), 'exclude', JSON_ARRAY('n35', 'n44')),
    JSON_OBJECT('action', 'Upload file Layout', 'template', '[EGR] Quy trình đánh giá đầu tư', 'members', JSON_ARRAY(JSON_OBJECT('node', 'n62', 'field', 'status')), 'exclude', JSON_ARRAY()),
    JSON_OBJECT('action', 'Lập BCĐX', 'template', '[EGR] Quy trình đánh giá đầu tư', 'members', JSON_ARRAY(JSON_OBJECT('node', 'n41', 'field', 'status')), 'exclude', JSON_ARRAY()),
    JSON_OBJECT('action', 'Duyệt BCĐX', 'template', '[EGR] Quy trình đánh giá đầu tư', 'members', JSON_ARRAY(JSON_OBJECT('node', 'n43', 'field', 'status')), 'exclude', JSON_ARRAY()),
    JSON_OBJECT('action', 'Trình và ký', 'template', '[EGR] Quy trình đánh giá đầu tư', 'members', JSON_ARRAY(JSON_OBJECT('node', 'n47', 'field', 'status'), JSON_OBJECT('node', 'n48', 'field', 'status'), JSON_OBJECT('node', 'n49', 'field', 'status'), JSON_OBJECT('node', 'n50', 'field', 'status')), 'exclude', JSON_ARRAY()),
    JSON_OBJECT('action', 'Trạng thái cuối', 'template', '[EGR] Quy trình đánh giá đầu tư', 'members', JSON_ARRAY(JSON_OBJECT('node', 'n58', 'field', 'status'), JSON_OBJECT('node', 'n60', 'field', 'status'), JSON_OBJECT('node', 'n59', 'field', 'status')), 'exclude', JSON_ARRAY())
  )),
  1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM automation_special_nodes WHERE node_key = 'latest_status');
