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
CREATE INDEX IF NOT EXISTS idx_pst_active_name        ON private_school_teachers       (is_active, full_name);

-- Private teachers: active + school filter + name sort (principal/HR path)
CREATE INDEX IF NOT EXISTS idx_pst_active_school_name ON private_school_teachers       (is_active, school_id, full_name);

-- International teachers: active + name sort
CREATE INDEX IF NOT EXISTS idx_ist_active_name        ON international_school_teachers (is_active, full_name);

-- International teachers: active + school filter + name sort
CREATE INDEX IF NOT EXISTS idx_ist_active_school_name ON international_school_teachers (is_active, school_id, full_name);
