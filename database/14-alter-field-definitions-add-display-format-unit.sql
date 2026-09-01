-- Add display_format and unit columns to field_definitions
-- Date: 2026-09-01

ALTER TABLE field_definitions 
  ADD COLUMN display_format VARCHAR(20) DEFAULT 'plain' AFTER decimal_places,
  ADD COLUMN unit VARCHAR(50) DEFAULT NULL AFTER display_format;
