-- 196: Keep shipment and total fields at warehouse-export header level.
-- Backfill header values from the most recently updated item before dropping
-- the duplicate item-level columns.

SET @item_export_metadata_columns = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'warehouse_export_items'
     AND COLUMN_NAME IN ('carrier', 'transport_code', 'transport_status', 'total_amount')
);
SET @header_export_metadata_columns = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'warehouse_exports'
     AND COLUMN_NAME IN ('carrier', 'transport_code', 'transport_status', 'total_amount')
);
SET @backfill_export_metadata_sql = IF(
  @item_export_metadata_columns = 4 AND @header_export_metadata_columns = 4,
  'UPDATE warehouse_exports we
     SET we.carrier = IF(
           we.carrier IS NULL OR LENGTH(we.carrier) = 0,
           (SELECT wei.carrier
              FROM warehouse_export_items wei
             WHERE wei.export_id = we.id
               AND wei.carrier IS NOT NULL
               AND LENGTH(wei.carrier) > 0
             ORDER BY wei.updated_at DESC, wei.id DESC
             LIMIT 1),
           we.carrier
         ),
         we.transport_code = IF(
           we.transport_code IS NULL OR LENGTH(we.transport_code) = 0,
           (SELECT wei.transport_code
              FROM warehouse_export_items wei
             WHERE wei.export_id = we.id
               AND wei.transport_code IS NOT NULL
               AND LENGTH(wei.transport_code) > 0
             ORDER BY wei.updated_at DESC, wei.id DESC
             LIMIT 1),
           we.transport_code
         ),
         we.transport_status = IF(
           we.transport_status IS NULL OR we.transport_status + 0 = 1,
           (SELECT wei.transport_status
              FROM warehouse_export_items wei
             WHERE wei.export_id = we.id
             ORDER BY wei.updated_at DESC, wei.id DESC
             LIMIT 1),
           we.transport_status
         ),
         we.total_amount = COALESCE(
           we.total_amount,
           (SELECT SUM(wei.total_amount)
              FROM warehouse_export_items wei
             WHERE wei.export_id = we.id)
         )',
  'SELECT 1'
);
PREPARE stmt_backfill_export_metadata FROM @backfill_export_metadata_sql;
EXECUTE stmt_backfill_export_metadata;
DEALLOCATE PREPARE stmt_backfill_export_metadata;

SET @has_export_item_carrier = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'warehouse_export_items'
     AND COLUMN_NAME = 'carrier'
);
SET @drop_export_item_carrier_sql = IF(
  @has_export_item_carrier = 1,
  'ALTER TABLE warehouse_export_items DROP COLUMN carrier',
  'SELECT 1'
);
PREPARE stmt_drop_export_item_carrier FROM @drop_export_item_carrier_sql;
EXECUTE stmt_drop_export_item_carrier;
DEALLOCATE PREPARE stmt_drop_export_item_carrier;

SET @has_export_item_transport_code = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'warehouse_export_items'
     AND COLUMN_NAME = 'transport_code'
);
SET @drop_export_item_transport_code_sql = IF(
  @has_export_item_transport_code = 1,
  'ALTER TABLE warehouse_export_items DROP COLUMN transport_code',
  'SELECT 1'
);
PREPARE stmt_drop_export_item_transport_code FROM @drop_export_item_transport_code_sql;
EXECUTE stmt_drop_export_item_transport_code;
DEALLOCATE PREPARE stmt_drop_export_item_transport_code;

SET @has_export_item_transport_status = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'warehouse_export_items'
     AND COLUMN_NAME = 'transport_status'
);
SET @drop_export_item_transport_status_sql = IF(
  @has_export_item_transport_status = 1,
  'ALTER TABLE warehouse_export_items DROP COLUMN transport_status',
  'SELECT 1'
);
PREPARE stmt_drop_export_item_transport_status FROM @drop_export_item_transport_status_sql;
EXECUTE stmt_drop_export_item_transport_status;
DEALLOCATE PREPARE stmt_drop_export_item_transport_status;

SET @has_export_item_total_amount = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'warehouse_export_items'
     AND COLUMN_NAME = 'total_amount'
);
SET @drop_export_item_total_amount_sql = IF(
  @has_export_item_total_amount = 1,
  'ALTER TABLE warehouse_export_items DROP COLUMN total_amount',
  'SELECT 1'
);
PREPARE stmt_drop_export_item_total_amount FROM @drop_export_item_total_amount_sql;
EXECUTE stmt_drop_export_item_total_amount;
DEALLOCATE PREPARE stmt_drop_export_item_total_amount;
