-- Fix existing data: convert select field labels → values in custom_data
-- mo_hinh_dau_tu: "Nhượng quyền" → "NQ", "Tự đầu tư" → "TDT", "Liên kết" → "LK", "Nhượng quyền + Liên kết" → "NQ_LK"
UPDATE station_proposals
SET custom_data = JSON_SET(custom_data,
  '$.mo_hinh_dau_tu', CASE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_dau_tu'))
    WHEN 'Nhượng quyền' THEN 'NQ'
    WHEN 'Tự đầu tư' THEN 'TDT'
    WHEN 'Liên kết' THEN 'LK'
    WHEN 'Nhượng quyền + Liên kết' THEN 'NQ_LK'
    ELSE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_dau_tu'))
  END
)
WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_dau_tu')) IN (
  'Nhượng quyền', 'Tự đầu tư', 'Liên kết', 'Nhượng quyền + Liên kết'
);

-- vung_mien: "Miền Bắc" → "Bắc", "Miền Trung" → "Trung", "Miền Nam" → "Nam"
UPDATE station_proposals
SET custom_data = JSON_SET(custom_data,
  '$.vung_mien', CASE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.vung_mien'))
    WHEN 'Miền Bắc' THEN 'Bắc'
    WHEN 'Miền Trung' THEN 'Trung'
    WHEN 'Miền Nam' THEN 'Nam'
    ELSE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.vung_mien'))
  END
)
WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.vung_mien')) IN (
  'Miền Bắc', 'Miền Trung', 'Miền Nam'
);

-- stations: mo_hinh_tram (same options as mo_hinh_dau_tu)
UPDATE stations
SET custom_data = JSON_SET(custom_data,
  '$.mo_hinh_tram', CASE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_tram'))
    WHEN 'Nhượng quyền' THEN 'NQ'
    WHEN 'Tự đầu tư' THEN 'TDT'
    WHEN 'Liên kết' THEN 'LK'
    WHEN 'Nhượng quyền + Liên kết' THEN 'NQ_LK'
    ELSE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_tram'))
  END
)
WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_tram')) IN (
  'Nhượng quyền', 'Tự đầu tư', 'Liên kết', 'Nhượng quyền + Liên kết'
);
