-- 106: Kho tri thuc code/schema cho chatbot (SUPER_ADMIN) + cot log token/file
-- Muc dich:
--   1. Tao bang assistant_code_knowledge (triage rieng khoi assistant_knowledge):
--      code map + function-level (tu ma nguon) va schema digest (tu information_schema).
--      Gate SUPER_ADMIN o code dich vu; khong bao gio chua du lieu nghiep vu.
--   2. Them cot quan sat vao assistant_logs: file dinh kem + token + tool + cache.
-- Idempotent: CREATE TABLE IF NOT EXISTS + guard information_schema cho ADD COLUMN.

-- ============ 1. assistant_code_knowledge ============
CREATE TABLE IF NOT EXISTS assistant_code_knowledge (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_path VARCHAR(255) NOT NULL,
  kind ENUM('code','schema') NOT NULL DEFAULT 'code',
  heading VARCHAR(255) NOT NULL DEFAULT '',
  content MEDIUMTEXT NOT NULL,
  content_hash CHAR(40) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_code_knowledge (source_path, heading),
  FULLTEXT KEY ft_code_knowledge (heading, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ 2. assistant_logs: cot moi ============
SET @has_attach := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistant_logs' AND COLUMN_NAME = 'has_attachment'
);
SET @sql_attach := IF(@has_attach = 0,
'ALTER TABLE assistant_logs ADD COLUMN has_attachment TINYINT(1) NOT NULL DEFAULT 0 AFTER user_id',
'SELECT ''has_attachment exists'' AS info');
PREPARE stmt_attach FROM @sql_attach;
EXECUTE stmt_attach;
DEALLOCATE PREPARE stmt_attach;

SET @has_atypes := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistant_logs' AND COLUMN_NAME = 'attachment_types'
);
SET @sql_atypes := IF(@has_atypes = 0,
'ALTER TABLE assistant_logs ADD COLUMN attachment_types VARCHAR(255) DEFAULT NULL AFTER has_attachment',
'SELECT ''attachment_types exists'' AS info');
PREPARE stmt_atypes FROM @sql_atypes;
EXECUTE stmt_atypes;
DEALLOCATE PREPARE stmt_atypes;

SET @has_ptok := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistant_logs' AND COLUMN_NAME = 'prompt_tokens'
);
SET @sql_ptok := IF(@has_ptok = 0,
'ALTER TABLE assistant_logs ADD COLUMN prompt_tokens INT DEFAULT NULL AFTER attachment_types',
'SELECT ''prompt_tokens exists'' AS info');
PREPARE stmt_ptok FROM @sql_ptok;
EXECUTE stmt_ptok;
DEALLOCATE PREPARE stmt_ptok;

SET @has_ctok := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistant_logs' AND COLUMN_NAME = 'completion_tokens'
);
SET @sql_ctok := IF(@has_ctok = 0,
'ALTER TABLE assistant_logs ADD COLUMN completion_tokens INT DEFAULT NULL AFTER prompt_tokens',
'SELECT ''completion_tokens exists'' AS info');
PREPARE stmt_ctok FROM @sql_ctok;
EXECUTE stmt_ctok;
DEALLOCATE PREPARE stmt_ctok;

SET @has_tool := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistant_logs' AND COLUMN_NAME = 'tool'
);
SET @sql_tool := IF(@has_tool = 0,
'ALTER TABLE assistant_logs ADD COLUMN tool VARCHAR(64) DEFAULT NULL AFTER completion_tokens',
'SELECT ''tool exists'' AS info');
PREPARE stmt_tool FROM @sql_tool;
EXECUTE stmt_tool;
DEALLOCATE PREPARE stmt_tool;

SET @has_cached := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistant_logs' AND COLUMN_NAME = 'cached'
);
SET @sql_cached := IF(@has_cached = 0,
'ALTER TABLE assistant_logs ADD COLUMN cached TINYINT(1) NOT NULL DEFAULT 0 AFTER tool',
'SELECT ''cached exists'' AS info');
PREPARE stmt_cached FROM @sql_cached;
EXECUTE stmt_cached;
DEALLOCATE PREPARE stmt_cached;
