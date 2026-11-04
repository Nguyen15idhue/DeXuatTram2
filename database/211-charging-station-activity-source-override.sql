-- 211: Mở rộng enum source của journal ON trạm cho luồng SUPER_ADMIN bỏ qua bước
ALTER TABLE charging_station_activity_logs
  MODIFY COLUMN source ENUM('user','script','system_auto','admin_override') NOT NULL DEFAULT 'user';
