-- 24-guest-proposals.sql
-- Ke hoach 19 (form de xuat khong can dang nhap - Buoc 1): cot guest cho station_proposals + IP upload cho files
-- Chay 1 lan. Khong DROP/CREATE lai bang.

ALTER TABLE station_proposals MODIFY user_id INT NULL;

ALTER TABLE station_proposals ADD COLUMN submission_source ENUM('user','guest') NOT NULL DEFAULT 'user';

ALTER TABLE station_proposals ADD COLUMN tracking_code VARCHAR(20) NULL;

ALTER TABLE station_proposals ADD COLUMN submitter_ip VARCHAR(45) NULL;

CREATE INDEX idx_proposals_source ON station_proposals(submission_source);

CREATE UNIQUE INDEX uq_proposals_tracking ON station_proposals(tracking_code);

CREATE INDEX idx_proposals_phone ON station_proposals(owner_phone);

ALTER TABLE files ADD COLUMN submitter_ip VARCHAR(45) NULL;
