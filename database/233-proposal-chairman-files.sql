CREATE TABLE IF NOT EXISTS proposal_chairman_files (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT NOT NULL,
  file_id INT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  uploaded_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proposal_chairman_file (proposal_id, file_id),
  KEY idx_chairman_file (file_id),
  CONSTRAINT fk_chairman_files_proposal FOREIGN KEY (proposal_id)
    REFERENCES station_proposals(id) ON DELETE CASCADE,
  CONSTRAINT fk_chairman_files_file FOREIGN KEY (file_id)
    REFERENCES files(id) ON DELETE RESTRICT,
  CONSTRAINT fk_chairman_files_user FOREIGN KEY (uploaded_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO proposal_chairman_files (proposal_id, file_id, order_index, uploaded_by)
SELECT legacy.proposal_id, legacy.file_id,
  ROW_NUMBER() OVER (PARTITION BY legacy.proposal_id ORDER BY legacy.first_file DESC, legacy.file_id) - 1,
  f.uploaded_by
FROM (
  SELECT proposal_id, file_id, MAX(first_file) AS first_file
  FROM (
    SELECT id AS proposal_id, signed_file_id AS file_id, 1 AS first_file
    FROM station_proposals WHERE signed_file_id IS NOT NULL
    UNION ALL
    SELECT proposal_id, signed_file_id, 0
    FROM proposal_report_documents WHERE signed_file_id IS NOT NULL
  ) old_files
  GROUP BY proposal_id, file_id
) legacy
JOIN files f ON f.id = legacy.file_id
WHERE NOT EXISTS (
  SELECT 1 FROM proposal_chairman_files cf
  WHERE cf.proposal_id = legacy.proposal_id AND cf.file_id = legacy.file_id
);
