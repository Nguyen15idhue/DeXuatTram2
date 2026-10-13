-- 42: ID 1Office hien thi dang link (outputType url + url_template)

UPDATE field_definitions
SET formula_config = '{"expression": "IF(LEN(id_1office) > 0, id_1office, ''Chưa liên kết'')", "outputType": "url", "url_template": "https://egr.1office.vn/apps/customer-contact-contact/view?ID={value}", "compute_mode": "post", "referencedFields": []}'
WHERE entity = 'station_proposals' AND `key` = 'id_1office';
