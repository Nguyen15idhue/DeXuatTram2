-- Increase notification type capacity for charging-station task keys.
-- Idempotent: only widen the column when it is shorter than 64 characters.

SET @notification_type_length := (
  SELECT CHARACTER_MAXIMUM_LENGTH
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notifications'
    AND COLUMN_NAME = 'type'
);

SET @notification_type_ddl := IF(
  @notification_type_length IS NULL OR @notification_type_length < 64,
  'ALTER TABLE notifications MODIFY COLUMN type VARCHAR(64) NOT NULL',
  'SELECT ''notifications.type already supports 64 characters'' AS info'
);

PREPARE notification_type_stmt FROM @notification_type_ddl;
EXECUTE notification_type_stmt;
DEALLOCATE PREPARE notification_type_stmt;
