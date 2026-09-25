-- 112: Chuan hoa hang so bao cao BCX (docs/8/58)
-- Cong ty chi co 1 Tong Giam doc -> dong bo signer_tgd_tdt + signer_tgd_nq_lk.
-- Idempotent: INSERT ... ON DUPLICATE KEY UPDATE (khong ghi de neu da sua tay) + UPDATE co dieu kien gia tri seed cu.
-- Chinh sua gia tri sau nay tai /admin/documents (SUPER_ADMIN).

INSERT INTO `document_constants` (`key`,`label`,`value`,`group_name`)
VALUES ('signer_tgd_nq_lk','Tổng Giám đốc (mẫu NQ/LK)','Nguyễn Trung Dũng','Chữ ký')
ON DUPLICATE KEY UPDATE `key` = `key`;

UPDATE `document_constants`
SET `value` = 'Nguyễn Trung Dũng',
    `label` = CASE WHEN `key` = 'signer_tgd_tdt' THEN 'Tổng Giám đốc (mẫu TDT)' ELSE 'Tổng Giám đốc (mẫu NQ/LK)' END
WHERE `key` IN ('signer_tgd_tdt','signer_tgd_nq_lk')
  AND (`value` IS NULL OR `value` IN ('', 'Lê Hoàng Hải', 'Nguyễn Huy Phong'));
