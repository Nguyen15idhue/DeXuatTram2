ALTER TABLE forms ADD COLUMN purpose ENUM('create','view','all') NOT NULL DEFAULT 'all';
ALTER TABLE forms ADD INDEX idx_purpose (purpose);
