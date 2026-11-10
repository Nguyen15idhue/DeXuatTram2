CREATE TABLE IF NOT EXISTS business_calendar_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  weekly JSON NOT NULL,
  exceptions JSON NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_business_calendar_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_calendar_config (
  id TINYINT NOT NULL PRIMARY KEY,
  active_version_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_business_calendar_singleton CHECK (id = 1),
  CONSTRAINT fk_business_calendar_active FOREIGN KEY (active_version_id) REFERENCES business_calendar_versions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO business_calendar_versions (timezone, weekly, exceptions)
SELECT 'Asia/Ho_Chi_Minh',
  JSON_OBJECT(
    '1', JSON_ARRAY(JSON_ARRAY('07:30', '11:30'), JSON_ARRAY('13:00', '17:00')),
    '2', JSON_ARRAY(JSON_ARRAY('07:30', '11:30'), JSON_ARRAY('13:00', '17:00')),
    '3', JSON_ARRAY(JSON_ARRAY('07:30', '11:30'), JSON_ARRAY('13:00', '17:00')),
    '4', JSON_ARRAY(JSON_ARRAY('07:30', '11:30'), JSON_ARRAY('13:00', '17:00')),
    '5', JSON_ARRAY(JSON_ARRAY('07:30', '11:30'), JSON_ARRAY('13:00', '17:00')),
    '6', JSON_ARRAY(JSON_ARRAY('07:30', '11:30'), JSON_ARRAY('13:00', '17:00')),
    '7', JSON_ARRAY()
  ),
  JSON_OBJECT()
WHERE NOT EXISTS (SELECT 1 FROM business_calendar_versions);

INSERT INTO business_calendar_config (id, active_version_id)
SELECT 1, MIN(id) FROM business_calendar_versions
HAVING MIN(id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM business_calendar_config WHERE id = 1);
