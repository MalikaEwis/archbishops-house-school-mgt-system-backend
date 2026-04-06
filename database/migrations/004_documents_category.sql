-- ============================================================
-- Migration 004 — Expand documents table for full DMS
-- ============================================================

-- 1. Add document category (the "subject" of the document)
ALTER TABLE documents
  ADD COLUMN doc_category
    ENUM('Teachers','Religious','Students','Principals','Non_academic')
    NOT NULL DEFAULT 'Teachers'
  AFTER owner_id;

-- 2. Allow documents not tied to a specific person (school-level /
--    general forms) by making owner nullable.
ALTER TABLE documents
  MODIFY owner_type
    ENUM('Private','International','Father','Rector','Principal','Student','General')
    NULL COMMENT 'NULL = no specific owner entity';

ALTER TABLE documents
  MODIFY owner_id INT UNSIGNED NULL;

-- 3. Indexes for common list-page filter combos
ALTER TABLE documents
  ADD INDEX IF NOT EXISTS idx_doc_category    (doc_category),
  ADD INDEX IF NOT EXISTS idx_doc_admin_only  (admin_only),
  ADD INDEX IF NOT EXISTS idx_doc_form_code   (form_code);
