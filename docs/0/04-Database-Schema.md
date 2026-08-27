# DATABASE SCHEMA

> **Database:** `station_management`
> **Charset:** utf8mb4 (Vietnamese support)
> **Engine:** InnoDB

---

## 1. TỔNG QUAN

```
users (1) ────── (N) station_proposals
         user_id FK
```

```
stations          → Trạm đã được tạo (thực tế)
station_proposals → Đề xuất trạm mới (chưa duyệt)
```

**QUAN TRỌNG:** `Station` và `Station Proposal` là hai entity ĐỘC LẬP. KHÔNG merge.

---

## 2. BẢNG `users`

| Column | Type | Constraints | Mô tả |
|--------|------|-------------|-------|
| id | INT AUTO_INCREMENT | PRIMARY KEY | |
| full_name | VARCHAR(100) | NOT NULL | Họ tên |
| email | VARCHAR(100) | UNIQUE, NOT NULL | Email đăng nhập |
| phone | VARCHAR(20) | | Số điện thoại |
| password | VARCHAR(255) | NOT NULL | bcrypt hash |
| role | ENUM('USER','ADMIN') | DEFAULT 'USER' | Phân quyền |
| status | ENUM('ACTIVE','LOCKED') | DEFAULT 'ACTIVE' | Trạng thái |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

### Indexes
```sql
CREATE UNIQUE INDEX idx_users_email ON users(email);
```

---

## 3. BẢNG `stations`

| Column | Type | Constraints | Mô tả |
|--------|------|-------------|-------|
| id | INT AUTO_INCREMENT | PRIMARY KEY | |
| name | VARCHAR(200) | NOT NULL | Tên trạm |
| latitude | DECIMAL(10,8) | NOT NULL | Vĩ độ |
| longitude | DECIMAL(11,8) | NOT NULL | Kinh độ |
| address | VARCHAR(255) | | Địa chỉ |
| status | ENUM('ACTIVE','DEPLOYING') | DEFAULT 'ACTIVE' | Trạng thái |
| description | TEXT | | Mô tả |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

### Indexes
```sql
CREATE INDEX idx_stations_status ON stations(status);
CREATE INDEX idx_stations_location ON stations(latitude, longitude);
```

### Status Values
| Status | Màu marker | Ý nghĩa |
|--------|-----------|----------|
| ACTIVE | 🟢 Xanh | Đang hoạt động |
| DEPLOYING | 🟡 Vàng | Đang triển khai |

---

## 4. BẢNG `station_proposals`

| Column | Type | Constraints | Mô tả |
|--------|------|-------------|-------|
| id | INT AUTO_INCREMENT | PRIMARY KEY | |
| user_id | INT | NOT NULL, FK → users(id) ON DELETE CASCADE | Người tạo |
| latitude | DECIMAL(10,8) | NOT NULL | Vĩ độ |
| longitude | DECIMAL(11,8) | NOT NULL | Kinh độ |
| owner_name | VARCHAR(100) | NOT NULL | Tên chủ mặt bằng |
| owner_phone | VARCHAR(20) | NOT NULL | SĐT chủ MB |
| address | VARCHAR(255) | | Địa chỉ |
| area | VARCHAR(50) | | Diện tích |
| land_type | VARCHAR(100) | | Loại mặt bằng |
| description | TEXT | | Ghi chú |
| status | ENUM(...) | DEFAULT 'PENDING' | Trạng thái |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

### Status Values
```
PENDING → REVIEWING → APPROVED
                      → REJECTED
```

| Status | Màu marker | Ý nghĩa |
|--------|-----------|----------|
| PENDING | 🟠 Cam | Chờ duyệt |
| REVIEWING | 🔵 Xanh dương | Đang xem xét |
| APPROVED | 🟢 Xanh | Đã duyệt |
| REJECTED | 🔴 Đỏ | Bị từ chối |

### Indexes
```sql
CREATE INDEX idx_proposals_status ON station_proposals(status);
CREATE INDEX idx_proposals_user ON station_proposals(user_id);
```

---

## 5. SEED DATA

### Users

| id | email | role | status | Password |
|----|-------|------|--------|----------|
| 1 | admin@station.com | ADMIN | ACTIVE | 123456 |
| 2 | user1@example.com | USER | ACTIVE | 123456 |
| 3 | user2@example.com | USER | ACTIVE | 123456 |
| 4 | user3@example.com | USER | LOCKED | 123456 |

### Stations (seed)

| id | name | status | Location |
|----|------|--------|----------|
| 1 | Trạm Sạc Quận 1 | ACTIVE | Quận 1, HCM |
| 2 | Trạm Sạc Quận 3 | ACTIVE | Quận 3, HCM |
| 3 | Trạm Sạc Bình Thạnh | DEPLOYING | Bình Thạnh, HCM |
| 4 | Trạm Sạc Phú Nhuận | ACTIVE | Phú Nhuận, HCM |
| 5 | Trạm Sạc Thủ Đức | DEPLOYING | Thủ Đức, HCM |

### Proposals (seed)

| id | user_id | status | Location |
|----|---------|--------|----------|
| 1 | 2 | PENDING | Quận 7, HCM |
| 2 | 3 | REVIEWING | Quận 10, HCM |
| 3 | 2 | APPROVED | Quận 4, HCM |

---

## 6. SQL SCRIPTS

### Tạo bảng (`01-create-tables.sql`)

```sql
-- Tạo database
CREATE DATABASE IF NOT EXISTS station_management
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE station_management;

-- Bảng users
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  role ENUM('USER', 'ADMIN') DEFAULT 'USER',
  status ENUM('ACTIVE', 'LOCKED') DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Bảng stations
CREATE TABLE stations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  address VARCHAR(255),
  status ENUM('ACTIVE', 'DEPLOYING') DEFAULT 'ACTIVE',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Bảng station_proposals
CREATE TABLE station_proposals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  owner_name VARCHAR(100) NOT NULL,
  owner_phone VARCHAR(20) NOT NULL,
  address VARCHAR(255),
  area VARCHAR(50),
  land_type VARCHAR(100),
  description TEXT,
  status ENUM('PENDING', 'REVIEWING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_stations_status ON stations(status);
CREATE INDEX idx_stations_location ON stations(latitude, longitude);
CREATE INDEX idx_proposals_status ON station_proposals(status);
CREATE INDEX idx_proposals_user ON station_proposals(user_id);
```

### Seed data (`02-seed-data.sql`)

```sql
USE station_management;
SET NAMES utf8mb4;

INSERT INTO users (full_name, email, phone, password, role, status) VALUES
('Admin System', 'admin@station.com', '0901234567',
  '$2b$10$fRKEtPkejupPEivKOJ0D0O22OfY8ad01jF2AN7P9/NBpzX3IukMIS', 'ADMIN', 'ACTIVE'),
('Nguyễn Văn A', 'user1@example.com', '0912345678',
  '$2b$10$fRKEtPkejupPEivKOJ0D0O22OfY8ad01jF2AN7P9/NBpzX3IukMIS', 'USER', 'ACTIVE'),
('Trần Thị B', 'user2@example.com', '0923456789',
  '$2b$10$fRKEtPkejupPEivKOJ0D0O22OfY8ad01jF2AN7P9/NBpzX3IukMIS', 'USER', 'ACTIVE'),
('Lê Văn C', 'user3@example.com', '0934567890',
  '$2b$10$fRKEtPkejupPEivKOJ0D0O22OfY8ad01jF2AN7P9/NBpzX3IukMIS', 'USER', 'LOCKED');

INSERT INTO stations (name, latitude, longitude, address, status, description) VALUES
('Trạm Sạc Quận 1', 10.7769, 106.7009, '123 Nguyễn Huệ, Quận 1, TP.HCM', 'ACTIVE', 'Trạm sạc chính'),
('Trạm Sạc Quận 3', 10.7835, 106.6822, '456 Lê Lai, Quận 3, TP.HCM', 'ACTIVE', 'Khu vực cầu_allocated'),
('Trạm Sạc Bình Thạnh', 10.8012, 106.7109, '789 Xô Viết Nghệ Tĩnh', 'DEPLOYING', 'Đang lắp đặt'),
('Trạm Sạc Phú Nhuận', 10.7995, 106.6782, '321 Phan Đình Phùng', 'ACTIVE', 'Mới khai trương'),
('Trạm Sạc Thủ Đức', 10.8510, 106.7530, '654 Võ Văn Ngân', 'DEPLOYING', 'Đang thi công');

INSERT INTO station_proposals (user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description, status) VALUES
(2, 10.7626, 106.6601, 'Nguyễn Văn A', '0912345678', '123 Nguyễn Lương Bằng, Q7', '200m2', 'Thương mại', 'Dự kiến mở trạm Q7', 'PENDING'),
(3, 10.7845, 106.6985, 'Trần Thị B', '0923456789', '456 Cách Mạng Tháng 8, Q10', '150m2', 'Dân cư', 'Trạm sạc khu dân cư', 'REVIEWING'),
(2, 10.7532, 106.6512, 'Nguyễn Văn A', '0912345678', '789 Bến Vân Đồn, Q4', '180m2', 'Hỗn hợp', 'Gần trung tâm', 'APPROVED');
```

---

## 7. TRUY VẤT MẪU

```sql
-- Tìm trạm theo tên
SELECT * FROM stations WHERE name LIKE '%Quận%';

-- Lọc theo status
SELECT * FROM stations WHERE status = 'ACTIVE';

-- Phân trang
SELECT * FROM stations ORDER BY created_at DESC LIMIT 10 OFFSET 0;

-- Lấy proposals của user
SELECT * FROM station_proposals WHERE user_id = 2 ORDER BY created_at DESC;

-- Đếm tổng stations
SELECT COUNT(*) as total FROM stations;

-- Join stations + proposals cho map
SELECT id, name, latitude, longitude, address, status, 'station' as type FROM stations
UNION ALL
SELECT id, CONCAT('Đề xuất: ', owner_name), latitude, longitude, address, status, 'proposal' as type FROM station_proposals;
```
