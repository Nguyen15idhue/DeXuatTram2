-- 26-proposer-name-field.sql
-- Field nguoi_de_xuat (formula post): user_id null -> 'Khach', con lai -> ten user.
-- user_name do backend nap vao scope post (dynamicEngineService.computePostFormulas).

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, formula_config, status)
VALUES ('station_proposals', 'nguoi_de_xuat', 'Người đề xuất', 'formula', 'json', 0,
 '{"compute_mode": "post", "expression": "IF(LEN(user_name) > 0, user_name, ''Khách'')", "referencedFields": [], "outputType": "text"}',
 'active');

SET @nguoi_fid = (SELECT id FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'nguoi_de_xuat');

INSERT INTO form_fields (form_id, field_id, order_index, visible) VALUES
(9, @nguoi_fid, 15, 1);

INSERT INTO view_fields (view_id, field_id, order_index, visible, sortable, filterable) VALUES
(8, @nguoi_fid, 14, 1, 1, 1);
