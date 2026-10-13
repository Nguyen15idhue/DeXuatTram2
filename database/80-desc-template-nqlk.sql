-- 80: Desc template 1Office - them section cha "Nhuong quyen va Lien ket" chua 2 section con
-- cho mo hinh NQ_LK (docs/5/42 - P5). Idempotent, khong ghi de 3 section don NQ/LK/TDT.

UPDATE api_configs
SET desc_template_config = JSON_ARRAY_APPEND(
  desc_template_config,
  '$.sections',
  JSON_OBJECT(
    'id', 'nqlk_desc_parent',
    'color', '#0ea5e9',
    'emoji', '🤝',
    'title', 'Nhượng quyền và Liên kết',
    'layout', '2col',
    'always_show', false,
    'collapsible', false,
    'condition', JSON_OBJECT('field', 'mo_hinh_dau_tu', 'value', 'NQ_LK', 'operator', '='),
    'sections', JSON_ARRAY(
      JSON_OBJECT(
        'id', 'nqlk_desc_nq',
        'color', '#3498db',
        'emoji', '🏪',
        'title', 'Nhượng quyền',
        'layout', '2col',
        'collapsible', false,
        'fields', JSON_ARRAY('chinh_sach_nq', 'loai_tru_nq', 'nq_chia_loi_nhuan_tmt', 'nq_chia_loi_nhuan_nq')
      ),
      JSON_OBJECT(
        'id', 'nqlk_desc_lk',
        'color', '#9b59b6',
        'emoji', '🤝',
        'title', 'Liên kết',
        'layout', '2col',
        'collapsible', false,
        'fields', JSON_ARRAY('chinh_sach_lk', 'loai_tru_lk', 'chi_phi_van_chuyen', 'chi_phi_tram_bien_ap', 'chi_phi_ha_tang', 'chi_phi_thue_vi_tri', 'lk_ty_le_tmt', 'lk_ty_le_doi_tac', 'lk_chia_loi_nhuan_tmt', 'lk_chia_loi_nhuan_lk', 'dat_coc', 'ghi_chu_dat_coc', 'tong_chi_phi')
      )
    )
  )
)
WHERE id = 3
  AND JSON_SEARCH(desc_template_config, 'one', 'nqlk_desc_parent') IS NULL;

SELECT 'desc_parent' AS metric,
       JSON_LENGTH(desc_template_config, '$.sections') AS n_sections,
       JSON_EXTRACT(desc_template_config, '$.sections[8].id') AS sec8,
       JSON_LENGTH(desc_template_config, '$.sections[8].sections') AS n_children
FROM api_configs WHERE id = 3;
