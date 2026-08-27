-- ============================================
-- SEED DATA: Station Management System
-- Charset: UTF-8 (Vietnamese support)
-- ============================================
USE station_management;

-- Đảm bảo connection使用 UTF-8
SET NAMES utf8mb4;
SET CHARACTER_SET_CLIENT = utf8mb4;
SET CHARACTER_SET_CONNECTION = utf8mb4;
SET CHARACTER_SET_RESULTS = utf8mb4;

-- ============================================
-- USERS (1 admin + 3 users)
-- Password mặc định: 123456 (đã hash bcrypt)
-- ============================================
INSERT INTO users (full_name, email, phone, password, role, status) VALUES
('Admin System', 'admin@station.com', '0901234567', '$2b$10$fRKEtPkejupPEivKOJ0D0O22OfY8ad01jF2AN7P9/NBpzX3IukMIS', 'ADMIN', 'ACTIVE'),
('Nguyễn Văn A', 'user1@example.com', '0912345678', '$2b$10$fRKEtPkejupPEivKOJ0D0O22OfY8ad01jF2AN7P9/NBpzX3IukMIS', 'USER', 'ACTIVE'),
('Trần Thị B', 'user2@example.com', '0923456789', '$2b$10$fRKEtPkejupPEivKOJ0D0O22OfY8ad01jF2AN7P9/NBpzX3IukMIS', 'USER', 'ACTIVE'),
('Lê Văn C', 'user3@example.com', '0934567890', '$2b$10$fRKEtPkejupPEivKOJ0D0O22OfY8ad01jF2AN7P9/NBpzX3IukMIS', 'USER', 'LOCKED');

-- ============================================
-- STATIONS (5 stations tại HCM)
-- ============================================
INSERT INTO stations (name, latitude, longitude, address, status, description) VALUES
('Trạm Sạc Quận 1', 10.7769, 106.7009, '123 Nguyễn Huệ, Quận 1, TP.HCM', 'ACTIVE', 'Trạm sạc chính tại trung tâm'),
('Trạm Sạc Quận 3', 10.7835, 106.6822, '456 Lê Lai, Quận 3, TP.HCM', 'ACTIVE', 'Trạm sạc khu vực cầu_allocated'),
('Trạm Sạc Bình Thạnh', 10.8012, 106.7109, '789 Xô Viết Nghệ Tĩnh, Bình Thạnh', 'DEPLOYING', 'Đang trong quá trình lắp đặt'),
('Trạm Sạc Phú Nhuận', 10.7995, 106.6782, '321 Phan Đình Phùng, Phú Nhuận', 'ACTIVE', 'Trạm sạc mới khai trương'),
('Trạm Sạc Thủ Đức', 10.8510, 106.7530, '654 Võ Văn Ngân, Thủ Đức', 'DEPLOYING', 'Đang thi công');

-- ============================================
-- STATION PROPOSALS (3 proposals từ user_id = 2,3)
-- ============================================
INSERT INTO station_proposals (user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description, status) VALUES
(2, 10.7626, 106.6601, 'Nguyễn Văn A', '0912345678', '123 Đường Nguyễn Lương Bằng, Quận 7, TP.HCM', '200m2', 'Thương mại', 'Dự kiến mở trạm tại Quận 7', 'PENDING'),
(3, 10.7845, 106.6985, 'Trần Thị B', '0923456789', '456 Đường Cách Mạng Tháng 8, Quận 10, TP.HCM', '150m2', 'Dân cư', 'Đề xuất trạm sạc khu dân cư', 'REVIEWING'),
(2, 10.7532, 106.6512, 'Nguyễn Văn A', '0912345678', '789 Đường Bến Vân Đồn, Quận 4, TP.HCM', '180m2', 'Hỗn hợp', 'Gần khu vực trung tâm', 'APPROVED');
