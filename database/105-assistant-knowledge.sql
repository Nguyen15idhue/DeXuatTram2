-- 105: Kho tri thuc noi bo cho chatbot huong dan (tu tai lieu trong repo)
-- Muc dich: chatbot tra loi duoc ca cau hoi ngoai 73 bai help, dua tren AGENTS.md + docs/**/*.md.
-- KHONG chua du lieu nghiep vu (stations/proposals/users); allowlist + redaction o script index.
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS assistant_knowledge (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_path VARCHAR(255) NOT NULL,
  heading VARCHAR(255) NOT NULL DEFAULT '',
  content MEDIUMTEXT NOT NULL,
  tags JSON DEFAULT NULL,
  content_hash CHAR(40) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_knowledge (source_path, heading),
  FULLTEXT KEY ft_knowledge (heading, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
