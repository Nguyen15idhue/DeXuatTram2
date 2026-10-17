-- 168-ev-report-vehicle-group-multiselect.sql
-- Kế hoạch 78 (bổ sung): đổi câu hỏi "Quý khách có nhu cầu sạc điện cho nhóm
-- phương tiện nào?" (nhom_phuong_tien) từ select (1 lựa chọn) sang multiselect
-- (chọn nhiều nhóm). Giữ nguyên options + required.
-- Chuẩn hoá dữ liệu cũ: giá trị đang là chuỗi -> mảng 1 phần tử.
-- Idempotent. Không sửa entity/bảng khác. Không DROP/CREATE lại.

-- ============ 1. Đổi type sang multiselect ============
UPDATE field_definitions
   SET type = 'multiselect'
 WHERE entity = 'ev_charging_reports'
   AND `key` = 'nhom_phuong_tien'
   AND type <> 'multiselect';

-- ============ 2. Chuẩn hoá dữ liệu cũ (chuỗi -> mảng) ============
UPDATE ev_charging_reports
   SET custom_data = JSON_SET(
         custom_data,
         '$.nhom_phuong_tien',
         JSON_ARRAY(JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.nhom_phuong_tien')))
       )
 WHERE JSON_TYPE(JSON_EXTRACT(custom_data, '$.nhom_phuong_tien')) = 'STRING'
   AND JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.nhom_phuong_tien')) <> '';
