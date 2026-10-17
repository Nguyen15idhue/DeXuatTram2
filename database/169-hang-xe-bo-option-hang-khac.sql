-- 169-hang-xe-bo-option-hang-khac.sql
-- Kế hoạch 78 (bổ sung): hãng xe "Khác" nay do form khách tự sinh ra
-- (option chỉ ở UI "Khác (nhập tay)" -> mở ô nhập tự do, xem EvReportGuestPage.jsx).
-- Bỏ option "Hãng khác" đã seed trong data list `dm_hang_xe` (migration 166) để
-- dropdown không có 2 lựa chọn "khác" trùng nghĩa.
-- Idempotent. Không sửa entity/bảng khác. Không DROP/CREATE lại.

DELETE r
  FROM data_list_rows r
  JOIN data_lists l ON l.id = r.list_id
 WHERE l.name = 'dm_hang_xe'
   AND JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.hang_xe')) = 'Hãng khác';
