-- 84: Bat required cho cot cua bang chi_phi_lk (docs/5/42) - chan dong trong.
-- FE DynamicForm.validate + BE dynamicUtils.validateField da ho tro validate tung o co col.required.
-- Chi ap dung cho chi_phi_lk; cac bang cu (tdt_tru, tdt_chi_phi_khac, loai_tru_nq/lk) khong set required -> khong doi hanh vi.

UPDATE field_definitions
   SET source_config = JSON_SET(source_config, '$.columns[0].required', true, '$.columns[1].required', true)
 WHERE entity = 'station_proposals' AND `key` = 'chi_phi_lk';

SELECT 'chi_phi_lk_cols' AS metric, JSON_EXTRACT(source_config,'$.columns[*].key') AS cols, JSON_EXTRACT(source_config,'$.columns[*].required') AS reqs
FROM field_definitions WHERE entity='station_proposals' AND `key`='chi_phi_lk';
