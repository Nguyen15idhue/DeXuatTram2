-- 25-unique-code-indexes.sql
-- Chong trung ma de xuat / ma tram o muc DB: cot generated trich tu custom_data + UNIQUE INDEX.
-- Cac row chua co ma (NULL) khong bi anh huong (UNIQUE cho phep nhieu NULL).
-- Chay 1 lan. Yeu cau: khong con ma trung truoc khi chay (da fix 365 -> NQ_HNO_0003).

ALTER TABLE station_proposals
  ADD COLUMN ma_de_xuat_gen VARCHAR(50)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_de_xuat'))) STORED,
  ADD UNIQUE INDEX uq_proposals_ma_de_xuat (ma_de_xuat_gen);

ALTER TABLE stations
  ADD COLUMN ma_tram_gen VARCHAR(50)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram'))) STORED,
  ADD UNIQUE INDEX uq_stations_ma_tram (ma_tram_gen);
