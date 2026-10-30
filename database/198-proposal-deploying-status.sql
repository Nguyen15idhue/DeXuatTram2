-- Add the ON-station deployment stage between contract signing and activation.

ALTER TABLE station_proposals
  MODIFY COLUMN status ENUM(
    'PENDING','REVIEWING','PRINCIPLE_APPROVED','APPROVED','REJECTED','CANCELLED',
    'CONTRACT_SIGNED','CONTRACT_FAILED','ARCHIVED',
    'GRADING','GDTTKD_EVALUATING','RE_GRADING','RE_GDTTKD_EVALUATING','TGD_REVIEW','DESIGNING',
    'INFOR_WAITING',
    'PROPOSAL_REPORT_CREATING','PROPOSAL_REPORT_RE_CREATING',
    'PROPOSAL_REPORT_REVIEWING','PROPOSAL_REPORT_UPDATING',
    'SIGNATURE_PENDING','COMPLETED','PAUSED','DEPLOYING','ACTIVE'
  ) NULL DEFAULT 'PENDING';

UPDATE field_definitions
   SET options = JSON_ARRAY_APPEND(COALESCE(options, JSON_ARRAY()), '$', JSON_OBJECT(
     'value', 'DEPLOYING',
     'label', 'Đang triển khai',
     'color', '#2563eb',
     'icon', 'construction',
     'sort_order', 20.5,
     'show_in_legend', 0,
     'borderRadius', 'rounded'
   )),
       updated_at = NOW()
 WHERE entity = 'station_proposals'
   AND `key` = 'status'
   AND JSON_SEARCH(options, 'one', 'DEPLOYING', NULL, '$[*].value') IS NULL;
