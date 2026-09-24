-- 110: Doi ten view Excel De xuat co ban thanh Excel De xuat - Tao nhanh
-- Idempotent, chi UPDATE dung view station_proposals / excel_basic.
UPDATE views SET name = 'Excel Đề xuất - Tạo nhanh'
WHERE entity = 'station_proposals' AND `usage` = 'excel_basic';
