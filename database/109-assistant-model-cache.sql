-- 109: Cache danh sach model thuc te cho trang quan ly Tro ly AI
-- Muc dich: GET /api/admin/assistant/models lay danh sach model that tu
-- Gemini ListModels / OpenRouter /models, cache 24h de chon multi thay vi nhap tay.
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS assistant_model_cache (
  provider VARCHAR(32) NOT NULL PRIMARY KEY,
  models JSON DEFAULT NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
