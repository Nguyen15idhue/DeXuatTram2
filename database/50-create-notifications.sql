-- Script 50: Bang notifications — thong bao trong app (chuong o header)
-- Ngay: 11/09/2026
-- Muc tieu: thong bao trang thai de xuat (tu choi/duyet/dang xem xet/gui lai) cho nguoi lien quan
-- type = PENDING | REVIEWING | APPROVED | REJECTED (FE map mau)

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id INT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  KEY idx_user_unread (user_id, is_read),
  KEY idx_created (created_at),
  KEY idx_entity (entity_type, entity_id),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verify
SELECT 'notifications' AS tbl, COUNT(*) AS row_count FROM notifications;
