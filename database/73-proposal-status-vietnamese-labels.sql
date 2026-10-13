-- 73: Nhan trang thai de xuat sang tieng Viet (giu nguyen value + mau)

UPDATE field_definitions
SET options = '[{"value":"PENDING","label":"Đang đề xuất","color":"#facc15","borderRadius":"rounded"},{"value":"REVIEWING","label":"Đang xem xét","color":"#3b82f6","borderRadius":"rounded"},{"value":"APPROVED","label":"Đã duyệt","color":"#16a34a","borderRadius":"rounded"},{"value":"REJECTED","label":"Từ chối","color":"#dc2626","borderRadius":"rounded"}]'
WHERE entity = 'station_proposals' AND `key` = 'status';
