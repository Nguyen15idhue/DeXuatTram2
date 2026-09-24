-- 108: Cau hinh provider/model/fallback cho chatbot (quan ly tu /admin/help)
-- Muc dich: SUPER_ADMIN doi model, bat/tat provider, doi thu tu fallback va test truc tiep
-- ma khong sua env/code. API key VAN nam trong .env (khong luu DB, khong tra ra FE).
-- Quy tac merge: models/vision_models rong = dung env; enabled=0 = bo qua provider.
-- Idempotent: CREATE TABLE IF NOT EXISTS + INSERT ... ON DUPLICATE KEY UPDATE (no-op).

CREATE TABLE IF NOT EXISTS assistant_provider_configs (
  provider VARCHAR(32) NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  models JSON DEFAULT NULL,
  vision_models JSON DEFAULT NULL,
  priority INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO assistant_provider_configs (provider, enabled, models, vision_models, priority) VALUES
  ('gemini', 1, CAST('[]' AS JSON), CAST('[]' AS JSON), 1),
  ('openrouter', 1, CAST('[]' AS JSON), CAST('[]' AS JSON), 2)
ON DUPLICATE KEY UPDATE provider = provider;
