-- 171-ev-report-view-link-column.sql
-- Kế hoạch 78 (bổ sung): hiển thị câu trả lời "Quý khách có muốn hợp tác với chúng tôi
-- để lắp đặt trạm sạc không?" trên BẢNG danh sách /admin/ev-reports (view bảng của
-- entity ev_charging_reports) và tô màu badge theo câu trả lời:
--   - "Có"    -> xanh lá (#16a34a)
--   - "Không" -> giữ màu mặc định của field (#666666, nâu xám)
-- Cột nằm ngay sau "nhóm phương tiện", các cột sau giữ đúng thứ tự cũ.
-- Idempotent (an toàn khi chạy lại). Không sửa bảng/entity khác. Không DROP/CREATE.

-- ============ 1. Màu option cho badge ============
UPDATE field_definitions
   SET `options` = JSON_SET(`options`, '$[0].color', '#16a34a', '$[0].borderRadius', 'rounded')
 WHERE entity = 'ev_charging_reports'
   AND `key` = 'hop_tac_lap_tram'
   AND JSON_VALID(`options`)
   AND JSON_UNQUOTE(JSON_EXTRACT(`options`, '$[0].value')) = 'Có';

-- "Không" dùng đúng màu mặc định (#666666) => bỏ color nếu lần chạy trước đã set
UPDATE field_definitions
   SET `options` = JSON_REMOVE(`options`, '$[1].color')
 WHERE entity = 'ev_charging_reports'
   AND `key` = 'hop_tac_lap_tram'
   AND JSON_VALID(`options`)
   AND JSON_UNQUOTE(JSON_EXTRACT(`options`, '$[1].value')) = 'Không'
   AND JSON_CONTAINS_PATH(`options`, 'one', '$[1].color') = 1;

-- ============ 2. Thêm cột vào view bảng của quản trị ============
SET @evr_view_id = (
    SELECT id FROM views
    WHERE entity = 'ev_charging_reports' AND `usage` = 'table' AND status = 'active'
    ORDER BY id ASC LIMIT 1
);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @evr_view_id, fd.id, 4, 1, 190, 1, 1, NULL
  FROM field_definitions fd
 WHERE fd.entity = 'ev_charging_reports'
   AND fd.`key` = 'hop_tac_lap_tram'
   AND @evr_view_id IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM (SELECT view_id, field_id FROM view_fields) x
        WHERE x.view_id = @evr_view_id AND x.field_id = fd.id
   );

-- ============ 3. Chuẩn hoá thứ tự cột (giá trị tuyệt đối, chạy lại không đổi) ============
UPDATE view_fields vf
  JOIN field_definitions fd ON fd.id = vf.field_id
   SET vf.order_index = FIELD(fd.`key`,
         'full_name', 'phone', 'hang_xe', 'nhom_phuong_tien',
         'hop_tac_lap_tram', 'province', 'ward', 'address') - 1
 WHERE vf.view_id = @evr_view_id
   AND fd.`key` IN ('full_name', 'phone', 'hang_xe', 'nhom_phuong_tien',
                    'hop_tac_lap_tram', 'province', 'ward', 'address');
