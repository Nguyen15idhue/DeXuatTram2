-- ============================================================
-- P4: Setup forms with sections for all 3 entities
-- ============================================================

-- ========================
-- 1. CREATE MISSING FORMS
-- ========================

-- Proposals View form
INSERT INTO forms (entity, name, description, purpose, layout_config, status, created_at, updated_at)
VALUES (
  'station_proposals',
  'Form station_proposals - Xem/sửa',
  'Form xem/sửa đề xuất trạm',
  'view',
  NULL,
  'active', NOW(), NOW()
);
-- ID = 14

-- Users Create form
INSERT INTO forms (entity, name, description, purpose, layout_config, status, created_at, updated_at)
VALUES (
  'users',
  'Form Users - Nhập liệu',
  'Form nhập liệu cho users',
  'create',
  NULL,
  'active', NOW(), NOW()
);
-- ID = 15

-- Users View form
INSERT INTO forms (entity, name, description, purpose, layout_config, status, created_at, updated_at)
VALUES (
  'users',
  'Form Users - Xem/sửa',
  'Form xem/sửa users',
  'view',
  NULL,
  'active', NOW(), NOW()
);
-- ID = 16

-- ========================
-- 2. UPDATE LAYOUT_CONFIG WITH SECTIONS
-- ========================

-- Form 12: Stations Create
UPDATE forms SET layout_config = '{
  "rows": [],
  "sections": [
    {
      "id": "s12_create_1",
      "title": "Thông tin trạm",
      "collapsible": false,
      "rows": [
        {"id": "r12_create_1", "columns": "1:2"},
        {"id": "r12_create_2", "columns": "1:1"}
      ]
    },
    {
      "id": "s12_create_2",
      "title": "Vị trí",
      "collapsible": false,
      "rows": [
        {"id": "r12_create_3", "columns": "1:2"},
        {"id": "r12_create_4", "columns": "1:1"},
        {"id": "r12_create_5", "columns": "1:2"}
      ]
    },
    {
      "id": "s12_create_3",
      "title": "Thông số kỹ thuật",
      "collapsible": false,
      "rows": [
        {"id": "r12_create_6", "columns": "1:2"}
      ]
    },
    {
      "id": "s12_create_4",
      "title": "Dữ liệu",
      "collapsible": false,
      "rows": [
        {"id": "r12_create_7", "columns": "1:1"},
        {"id": "r12_create_8", "columns": "1:1"}
      ]
    }
  ]
}' WHERE id = 12;

-- Form 10: Stations View
UPDATE forms SET layout_config = '{
  "rows": [],
  "sections": [
    {
      "id": "s10_view_1",
      "title": "Thông tin trạm",
      "collapsible": false,
      "rows": [
        {"id": "r10_view_1", "columns": "1:2"},
        {"id": "r10_view_2", "columns": "1:1"}
      ]
    },
    {
      "id": "s10_view_2",
      "title": "Vị trí",
      "collapsible": false,
      "rows": [
        {"id": "r10_view_3", "columns": "1:2"},
        {"id": "r10_view_4", "columns": "1:1"},
        {"id": "r10_view_5", "columns": "1:2"}
      ]
    },
    {
      "id": "s10_view_3",
      "title": "Thông số kỹ thuật",
      "collapsible": false,
      "rows": [
        {"id": "r10_view_6", "columns": "1:2"}
      ]
    },
    {
      "id": "s10_view_4",
      "title": "Dữ liệu",
      "collapsible": false,
      "rows": [
        {"id": "r10_view_7", "columns": "1:1"}
      ]
    }
  ]
}' WHERE id = 10;

-- Form 13: Proposals Create
UPDATE forms SET layout_config = '{
  "rows": [],
  "sections": [
    {
      "id": "s13_create_1",
      "title": "Thông tin chủ sở hữu",
      "collapsible": false,
      "rows": [
        {"id": "r13_create_1", "columns": "1:2"}
      ]
    },
    {
      "id": "s13_create_2",
      "title": "Vị trí",
      "collapsible": false,
      "rows": [
        {"id": "r13_create_2", "columns": "1:2"},
        {"id": "r13_create_3", "columns": "1:1"},
        {"id": "r13_create_4", "columns": "1:2"},
        {"id": "r13_create_5", "columns": "1:2"}
      ]
    },
    {
      "id": "s13_create_3",
      "title": "Thông tin đề xuất",
      "collapsible": false,
      "rows": [
        {"id": "r13_create_6", "columns": "1:1"},
        {"id": "r13_create_7", "columns": "1:2"},
        {"id": "r13_create_8", "columns": "1:2"},
        {"id": "r13_create_9", "columns": "1:2"}
      ]
    },
    {
      "id": "s13_create_4",
      "title": "Hồ sơ & Hình ảnh",
      "collapsible": false,
      "rows": [
        {"id": "r13_create_10", "columns": "1:2"}
      ]
    },
    {
      "id": "s13_create_5",
      "title": "Thông tin hệ thống",
      "collapsible": true,
      "rows": [
        {"id": "r13_create_11", "columns": "1:2"},
        {"id": "r13_create_12", "columns": "1:2"}
      ]
    }
  ]
}' WHERE id = 13;

-- Form 14: Proposals View
UPDATE forms SET layout_config = '{
  "rows": [],
  "sections": [
    {
      "id": "s14_view_1",
      "title": "Thông tin chủ sở hữu",
      "collapsible": false,
      "rows": [
        {"id": "r14_view_1", "columns": "1:2"}
      ]
    },
    {
      "id": "s14_view_2",
      "title": "Vị trí",
      "collapsible": false,
      "rows": [
        {"id": "r14_view_2", "columns": "1:2"},
        {"id": "r14_view_3", "columns": "1:1"},
        {"id": "r14_view_4", "columns": "1:2"},
        {"id": "r14_view_5", "columns": "1:2"}
      ]
    },
    {
      "id": "s14_view_3",
      "title": "Thông tin đề xuất",
      "collapsible": false,
      "rows": [
        {"id": "r14_view_6", "columns": "1:1"},
        {"id": "r14_view_7", "columns": "1:2"},
        {"id": "r14_view_8", "columns": "1:2"},
        {"id": "r14_view_9", "columns": "1:2"}
      ]
    },
    {
      "id": "s14_view_4",
      "title": "Hồ sơ & Hình ảnh",
      "collapsible": false,
      "rows": [
        {"id": "r14_view_10", "columns": "1:2"}
      ]
    },
    {
      "id": "s14_view_5",
      "title": "Thông tin hệ thống",
      "collapsible": true,
      "rows": [
        {"id": "r14_view_11", "columns": "1:2"},
        {"id": "r14_view_12", "columns": "1:2"}
      ]
    }
  ]
}' WHERE id = 14;

-- Form 15: Users Create
UPDATE forms SET layout_config = '{
  "rows": [],
  "sections": [
    {
      "id": "s15_create_1",
      "title": "Thông tin cá nhân",
      "collapsible": false,
      "rows": [
        {"id": "r15_create_1", "columns": "1:2"},
        {"id": "r15_create_2", "columns": "1:2"}
      ]
    },
    {
      "id": "s15_create_2",
      "title": "Tài khoản",
      "collapsible": false,
      "rows": [
        {"id": "r15_create_3", "columns": "1:2"}
      ]
    },
    {
      "id": "s15_create_3",
      "title": "Thông tin công việc",
      "collapsible": false,
      "rows": [
        {"id": "r15_create_4", "columns": "1:2"},
        {"id": "r15_create_5", "columns": "1:2"}
      ]
    }
  ]
}' WHERE id = 15;

-- Form 16: Users View
UPDATE forms SET layout_config = '{
  "rows": [],
  "sections": [
    {
      "id": "s16_view_1",
      "title": "Thông tin cá nhân",
      "collapsible": false,
      "rows": [
        {"id": "r16_view_1", "columns": "1:2"},
        {"id": "r16_view_2", "columns": "1:2"}
      ]
    },
    {
      "id": "s16_view_2",
      "title": "Tài khoản",
      "collapsible": false,
      "rows": [
        {"id": "r16_view_3", "columns": "1:2"}
      ]
    },
    {
      "id": "s16_view_3",
      "title": "Thông tin công việc",
      "collapsible": false,
      "rows": [
        {"id": "r16_view_4", "columns": "1:2"},
        {"id": "r16_view_5", "columns": "1:2"}
      ]
    }
  ]
}' WHERE id = 16;

-- ========================
-- 3. DELETE OLD form_fields for forms 10, 13 (they had minimal fields)
-- ========================

DELETE FROM form_fields WHERE form_id IN (10, 13);

-- ========================
-- 4. ADD form_fields FOR ALL 6 FORMS
-- ========================

-- -------------------------------------------------------
-- Form 12: Stations Create (field_ids: 32=name, 33=lat, 34=lng, 35=addr, 36=status, 37=desc, 39=tower_type, 40=power, 104=province, 105=ma_tinh, 106=ma_tram, 112=table)
-- -------------------------------------------------------

-- Section "Thông tin trạm": row1(name+status), row2(description)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(12, 32, 0, 1, '{"rowId":"r12_create_1","colIndex":0,"rowIndex":0,"colSpan":1}'),
(12, 36, 1, 1, '{"rowId":"r12_create_1","colIndex":1,"rowIndex":0,"colSpan":1}'),
(12, 37, 2, 1, '{"rowId":"r12_create_2","colIndex":0,"rowIndex":1,"colSpan":1}');

-- Section "Vị trí": row3(lat+lng), row4(address), row5(province+ma_tinh)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(12, 33, 3, 1, '{"rowId":"r12_create_3","colIndex":0,"rowIndex":2,"colSpan":1}'),
(12, 34, 4, 1, '{"rowId":"r12_create_3","colIndex":1,"rowIndex":2,"colSpan":1}'),
(12, 35, 5, 1, '{"rowId":"r12_create_4","colIndex":0,"rowIndex":3,"colSpan":1}'),
(12, 104, 6, 1, '{"rowId":"r12_create_5","colIndex":0,"rowIndex":4,"colSpan":1}'),
(12, 105, 7, 1, '{"rowId":"r12_create_5","colIndex":1,"rowIndex":4,"colSpan":1}');

-- Section "Thông số KT": row6(tower_type+power)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(12, 39, 8, 1, '{"rowId":"r12_create_6","colIndex":0,"rowIndex":5,"colSpan":1}'),
(12, 40, 9, 1, '{"rowId":"r12_create_6","colIndex":1,"rowIndex":5,"colSpan":1}');

-- Section "Dữ liệu": row7(table), row8(ma_tram)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(12, 112, 10, 1, '{"rowId":"r12_create_7","colIndex":0,"rowIndex":6,"colSpan":1}'),
(12, 106, 11, 1, '{"rowId":"r12_create_8","colIndex":0,"rowIndex":7,"colSpan":1}');

-- -------------------------------------------------------
-- Form 10: Stations View (same field layout as create)
-- -------------------------------------------------------
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(10, 32, 0, 1, '{"rowId":"r10_view_1","colIndex":0,"rowIndex":0,"colSpan":1}'),
(10, 36, 1, 1, '{"rowId":"r10_view_1","colIndex":1,"rowIndex":0,"colSpan":1}'),
(10, 37, 2, 1, '{"rowId":"r10_view_2","colIndex":0,"rowIndex":1,"colSpan":1}'),
(10, 33, 3, 1, '{"rowId":"r10_view_3","colIndex":0,"rowIndex":2,"colSpan":1}'),
(10, 34, 4, 1, '{"rowId":"r10_view_3","colIndex":1,"rowIndex":2,"colSpan":1}'),
(10, 35, 5, 1, '{"rowId":"r10_view_4","colIndex":0,"rowIndex":3,"colSpan":1}'),
(10, 104, 6, 1, '{"rowId":"r10_view_5","colIndex":0,"rowIndex":4,"colSpan":1}'),
(10, 105, 7, 1, '{"rowId":"r10_view_5","colIndex":1,"rowIndex":4,"colSpan":1}'),
(10, 39, 8, 1, '{"rowId":"r10_view_6","colIndex":0,"rowIndex":5,"colSpan":1}'),
(10, 40, 9, 1, '{"rowId":"r10_view_6","colIndex":1,"rowIndex":5,"colSpan":1}'),
(10, 112, 10, 1, '{"rowId":"r10_view_7","colIndex":0,"rowIndex":6,"colSpan":1}'),
(10, 106, 11, 1, '{"rowId":"r10_view_7","colIndex":1,"rowIndex":6,"colSpan":1}');

-- -------------------------------------------------------
-- Form 13: Proposals Create
-- Fields: 49=owner_name, 50=owner_phone, 51=lat, 52=lng, 53=addr, 54=area, 55=land_type, 56=desc, 57=status, 58=cost, 59=legal, 60=images, 90=province, 91=xa_phuong, 99=loai_tru, 100=vung_mien, 101=mo_hinh, 102=ma_tinh, 103=ma_dx(formula), 107=nguoi_dx(formula), 110=sales_ql(formula)
-- -------------------------------------------------------

-- Section "Chủ sở hữu": row1(owner_name+owner_phone)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(13, 49, 0, 1, '{"rowId":"r13_create_1","colIndex":0,"rowIndex":0,"colSpan":1}'),
(13, 50, 1, 1, '{"rowId":"r13_create_1","colIndex":1,"rowIndex":0,"colSpan":1}');

-- Section "Vị trí": row2(lat+lng), row3(addr), row4(province+xa_phuong), row5(area+land_type)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(13, 51, 2, 1, '{"rowId":"r13_create_2","colIndex":0,"rowIndex":1,"colSpan":1}'),
(13, 52, 3, 1, '{"rowId":"r13_create_2","colIndex":1,"rowIndex":1,"colSpan":1}'),
(13, 53, 4, 1, '{"rowId":"r13_create_3","colIndex":0,"rowIndex":2,"colSpan":1}'),
(13, 90, 5, 1, '{"rowId":"r13_create_4","colIndex":0,"rowIndex":3,"colSpan":1}'),
(13, 91, 6, 1, '{"rowId":"r13_create_4","colIndex":1,"rowIndex":3,"colSpan":1}'),
(13, 54, 7, 1, '{"rowId":"r13_create_5","colIndex":0,"rowIndex":4,"colSpan":1}'),
(13, 55, 8, 1, '{"rowId":"r13_create_5","colIndex":1,"rowIndex":4,"colSpan":1}');

-- Section "Thông tin đề xuất": row6(desc), row7(cost+loai_tru), row8(mo_hinh+vung_mien), row9(ma_tinh)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(13, 56, 9, 1, '{"rowId":"r13_create_6","colIndex":0,"rowIndex":5,"colSpan":1}'),
(13, 58, 10, 1, '{"rowId":"r13_create_7","colIndex":0,"rowIndex":6,"colSpan":1}'),
(13, 99, 11, 1, '{"rowId":"r13_create_7","colIndex":1,"rowIndex":6,"colSpan":1}'),
(13, 101, 12, 1, '{"rowId":"r13_create_8","colIndex":0,"rowIndex":7,"colSpan":1}'),
(13, 100, 13, 1, '{"rowId":"r13_create_8","colIndex":1,"rowIndex":7,"colSpan":1}'),
(13, 102, 14, 1, '{"rowId":"r13_create_9","colIndex":0,"rowIndex":8,"colSpan":1}');

-- Section "Hồ sơ": row10(legal+images)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(13, 59, 15, 1, '{"rowId":"r13_create_10","colIndex":0,"rowIndex":9,"colSpan":1}'),
(13, 60, 16, 1, '{"rowId":"r13_create_10","colIndex":1,"rowIndex":9,"colSpan":1}');

-- Section "Hệ thống": row11(status), row12(formulas)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(13, 57, 17, 1, '{"rowId":"r13_create_11","colIndex":0,"rowIndex":10,"colSpan":1}'),
(13, 103, 18, 1, '{"rowId":"r13_create_12","colIndex":0,"rowIndex":11,"colSpan":1}'),
(13, 107, 19, 1, '{"rowId":"r13_create_12","colIndex":1,"rowIndex":11,"colSpan":1}'),
(13, 110, 20, 1, '{"rowId":"r13_create_11","colIndex":1,"rowIndex":10,"colSpan":1}');

-- -------------------------------------------------------
-- Form 14: Proposals View (same layout as create)
-- -------------------------------------------------------
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(14, 49, 0, 1, '{"rowId":"r14_view_1","colIndex":0,"rowIndex":0,"colSpan":1}'),
(14, 50, 1, 1, '{"rowId":"r14_view_1","colIndex":1,"rowIndex":0,"colSpan":1}'),
(14, 51, 2, 1, '{"rowId":"r14_view_2","colIndex":0,"rowIndex":1,"colSpan":1}'),
(14, 52, 3, 1, '{"rowId":"r14_view_2","colIndex":1,"rowIndex":1,"colSpan":1}'),
(14, 53, 4, 1, '{"rowId":"r14_view_3","colIndex":0,"rowIndex":2,"colSpan":1}'),
(14, 90, 5, 1, '{"rowId":"r14_view_4","colIndex":0,"rowIndex":3,"colSpan":1}'),
(14, 91, 6, 1, '{"rowId":"r14_view_4","colIndex":1,"rowIndex":3,"colSpan":1}'),
(14, 54, 7, 1, '{"rowId":"r14_view_5","colIndex":0,"rowIndex":4,"colSpan":1}'),
(14, 55, 8, 1, '{"rowId":"r14_view_5","colIndex":1,"rowIndex":4,"colSpan":1}'),
(14, 56, 9, 1, '{"rowId":"r14_view_6","colIndex":0,"rowIndex":5,"colSpan":1}'),
(14, 58, 10, 1, '{"rowId":"r14_view_7","colIndex":0,"rowIndex":6,"colSpan":1}'),
(14, 99, 11, 1, '{"rowId":"r14_view_7","colIndex":1,"rowIndex":6,"colSpan":1}'),
(14, 101, 12, 1, '{"rowId":"r14_view_8","colIndex":0,"rowIndex":7,"colSpan":1}'),
(14, 100, 13, 1, '{"rowId":"r14_view_8","colIndex":1,"rowIndex":7,"colSpan":1}'),
(14, 102, 14, 1, '{"rowId":"r14_view_9","colIndex":0,"rowIndex":8,"colSpan":1}'),
(14, 59, 15, 1, '{"rowId":"r14_view_10","colIndex":0,"rowIndex":9,"colSpan":1}'),
(14, 60, 16, 1, '{"rowId":"r14_view_10","colIndex":1,"rowIndex":9,"colSpan":1}'),
(14, 57, 17, 1, '{"rowId":"r14_view_11","colIndex":0,"rowIndex":10,"colSpan":1}'),
(14, 103, 18, 1, '{"rowId":"r14_view_12","colIndex":0,"rowIndex":11,"colSpan":1}'),
(14, 107, 19, 1, '{"rowId":"r14_view_12","colIndex":1,"rowIndex":11,"colSpan":1}'),
(14, 110, 20, 1, '{"rowId":"r14_view_11","colIndex":1,"rowIndex":10,"colSpan":1}');

-- -------------------------------------------------------
-- Form 15: Users Create
-- Fields: 41=full_name, 42=email, 43=phone, 44=role, 45=status, 46=employee_code, 47=department, 48=avatar, 108=password, 109=external_id
-- -------------------------------------------------------

-- Section "Thông tin cá nhân": row1(full_name+email), row2(phone+avatar)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(15, 41, 0, 1, '{"rowId":"r15_create_1","colIndex":0,"rowIndex":0,"colSpan":1}'),
(15, 42, 1, 1, '{"rowId":"r15_create_1","colIndex":1,"rowIndex":0,"colSpan":1}'),
(15, 43, 2, 1, '{"rowId":"r15_create_2","colIndex":0,"rowIndex":1,"colSpan":1}'),
(15, 48, 3, 1, '{"rowId":"r15_create_2","colIndex":1,"rowIndex":1,"colSpan":1}');

-- Section "Tài khoản": row3(password+external_id)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(15, 108, 4, 1, '{"rowId":"r15_create_3","colIndex":0,"rowIndex":2,"colSpan":1}'),
(15, 109, 5, 1, '{"rowId":"r15_create_3","colIndex":1,"rowIndex":2,"colSpan":1}');

-- Section "Công việc": row4(role+status), row5(employee_code+department)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(15, 44, 6, 1, '{"rowId":"r15_create_4","colIndex":0,"rowIndex":3,"colSpan":1}'),
(15, 45, 7, 1, '{"rowId":"r15_create_4","colIndex":1,"rowIndex":3,"colSpan":1}'),
(15, 46, 8, 1, '{"rowId":"r15_create_5","colIndex":0,"rowIndex":4,"colSpan":1}'),
(15, 47, 9, 1, '{"rowId":"r15_create_5","colIndex":1,"rowIndex":4,"colSpan":1}');

-- -------------------------------------------------------
-- Form 16: Users View (same layout as create)
-- -------------------------------------------------------
INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES
(16, 41, 0, 1, '{"rowId":"r16_view_1","colIndex":0,"rowIndex":0,"colSpan":1}'),
(16, 42, 1, 1, '{"rowId":"r16_view_1","colIndex":1,"rowIndex":0,"colSpan":1}'),
(16, 43, 2, 1, '{"rowId":"r16_view_2","colIndex":0,"rowIndex":1,"colSpan":1}'),
(16, 48, 3, 1, '{"rowId":"r16_view_2","colIndex":1,"rowIndex":1,"colSpan":1}'),
(16, 108, 4, 1, '{"rowId":"r16_view_3","colIndex":0,"rowIndex":2,"colSpan":1}'),
(16, 109, 5, 1, '{"rowId":"r16_view_3","colIndex":1,"rowIndex":2,"colSpan":1}'),
(16, 44, 6, 1, '{"rowId":"r16_view_4","colIndex":0,"rowIndex":3,"colSpan":1}'),
(16, 45, 7, 1, '{"rowId":"r16_view_4","colIndex":1,"rowIndex":3,"colSpan":1}'),
(16, 46, 8, 1, '{"rowId":"r16_view_5","colIndex":0,"rowIndex":4,"colSpan":1}'),
(16, 47, 9, 1, '{"rowId":"r16_view_5","colIndex":1,"rowIndex":4,"colSpan":1}');
