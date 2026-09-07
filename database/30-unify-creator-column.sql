-- 30: Gop cot Nguoi tao vao Nguoi de xuat (file 25, Phase 3)
-- Quy uoc du an: SQL thu cong, khong DROP TABLE, chay lan luot bang tay.
-- CHAY VOI: mysql ... --default-character-set=utf8mb4
-- Field 107 hien "Ten (ROLE)", Khach neu guest. Backfill cac record cu.

UPDATE field_definitions SET formula_config = '{"expression": "IF(LEN(user_name) > 0, IF(LEN(user_role) > 0, CONCAT(user_name, '' ('', user_role, '')''), user_name), ''Khách'')", "outputType": "text", "compute_mode": "post", "referencedFields": []}', updated_at = NOW() WHERE id = 107;

-- Backfill nguoi_de_xuat: "Khách" (hex: 4B68C3A16368), "—" (hex: E28094)
UPDATE station_proposals p
LEFT JOIN users u ON p.user_id = u.id
SET p.custom_data = JSON_SET(
  COALESCE(p.custom_data, CAST('{}' AS JSON)),
  '$.nguoi_de_xuat',
  IF(u.id IS NULL,
    CAST(_utf8mb4 x'4B68C3A16368' AS CHAR CHARACTER SET utf8mb4),
    IF(u.role IS NULL OR u.role = '', u.full_name, CONCAT(u.full_name, ' (', u.role, ')'))
  )
);
