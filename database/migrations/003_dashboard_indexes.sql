-- ============================================================
-- Migration 003 — Dashboard query indexes
--
-- The dashboard list query filters by is_active (always),
-- optionally by school_id, and always ORDER BY full_name.
--
-- Composite indexes let MySQL satisfy both the WHERE and ORDER
-- BY from a single index scan, avoiding a filesort on large
-- result sets.
-- ============================================================

-- Private teachers: active + name sort (no school filter)
ALTER TABLE private_school_teachers
  ADD INDEX IF NOT EXISTS idx_pst_active_name (is_active, full_name);

-- Private teachers: active + school filter + name sort (principal/HR path)
ALTER TABLE private_school_teachers
  ADD INDEX IF NOT EXISTS idx_pst_active_school_name (is_active, school_id, full_name);

-- International teachers: active + name sort
ALTER TABLE international_school_teachers
  ADD INDEX IF NOT EXISTS idx_ist_active_name (is_active, full_name);

-- International teachers: active + school filter + name sort
ALTER TABLE international_school_teachers
  ADD INDEX IF NOT EXISTS idx_ist_active_school_name (is_active, school_id, full_name);
