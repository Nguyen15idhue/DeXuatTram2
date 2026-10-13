-- 158: them cot views.frozen_columns (so cot dau dong bang khi cuon ngang, mac dinh 2 gom STT).
ALTER TABLE views ADD COLUMN frozen_columns INT NOT NULL DEFAULT 2;
UPDATE views SET frozen_columns = 2 WHERE frozen_columns IS NULL;
