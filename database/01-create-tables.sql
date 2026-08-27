-- ============================================
-- DATABASE: Station Management System
-- ============================================

-- Tạo database nếu chưa có
CREATE DATABASE IF NOT EXISTS station_management;
USE station_management;

-- ============================================
-- BẢNG 1: USERS
-- ============================================
DROP TABLE IF EXISTS station_proposals;
DROP TABLE IF EXISTS stations;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  role ENUM('USER', 'ADMIN') DEFAULT 'USER',
  status ENUM('ACTIVE', 'LOCKED') DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- BẢNG 2: STATIONS
-- ============================================
CREATE TABLE stations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address VARCHAR(255),
  status ENUM('ACTIVE', 'DEPLOYING') DEFAULT 'ACTIVE',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- BẢNG 3: STATION PROPOSALS
-- ============================================
CREATE TABLE station_proposals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
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

-- ============================================
-- INDEXES (tối ưu performance)
-- ============================================
CREATE INDEX idx_stations_status ON stations(status);
CREATE INDEX idx_stations_location ON stations(latitude, longitude);
CREATE INDEX idx_proposals_status ON station_proposals(status);
CREATE INDEX idx_proposals_user ON station_proposals(user_id);
