-- 104: He thong Huong dan moi - bang help_categories, help_articles, assistant_logs
-- Muc dich: chuyen nguon chan ly trang huong dan tu guideData.*.js trong bundle sang DB;
-- lam nen cho trang cau hinh /admin/help (WordPress thu gon) + chatbot Nacc 1.
-- Idempotent: CREATE TABLE IF NOT EXISTS (chay lai khong loi).

-- ============ 1. help_categories ============
CREATE TABLE IF NOT EXISTS help_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  icon VARCHAR(50) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  visible_roles JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ 2. help_articles ============
CREATE TABLE IF NOT EXISTS help_articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(150) NOT NULL UNIQUE,
  legacy_id VARCHAR(20) DEFAULT NULL,
  category_id INT DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT DEFAULT NULL,
  content_json JSON DEFAULT NULL,
  content_html MEDIUMTEXT DEFAULT NULL,
  videos JSON DEFAULT NULL,
  images JSON DEFAULT NULL,
  route VARCHAR(255) DEFAULT NULL,
  tags JSON DEFAULT NULL,
  related JSON DEFAULT NULL,
  roles JSON DEFAULT NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  sort_order INT NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  created_by INT DEFAULT NULL,
  updated_by INT DEFAULT NULL,
  published_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FULLTEXT KEY ft_help_search (title, summary, content_html),
  CONSTRAINT fk_help_articles_category FOREIGN KEY (category_id)
    REFERENCES help_categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_help_articles_creator FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_help_articles_updater FOREIGN KEY (updated_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ 3. assistant_logs (phuc vu phase 5 - chatbot) ============
CREATE TABLE IF NOT EXISTS assistant_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question TEXT NOT NULL,
  answer MEDIUMTEXT DEFAULT NULL,
  sources JSON DEFAULT NULL,
  provider VARCHAR(20) DEFAULT NULL,
  latency_ms INT DEFAULT NULL,
  fallback_reason VARCHAR(255) DEFAULT NULL,
  user_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assistant_logs_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
