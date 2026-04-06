-- Migration 002: dedicated TIN sequence counter table
-- This table has exactly ONE row per (table_type, tin_category).
-- It is locked with SELECT … FOR UPDATE during every TIN allocation,
-- making it the single serialisation point for the global counter.
-- The school-level counter (tin_teacher_no_school) is derived inline
-- while the sequence lock is held, so it is also race-free.

CREATE TABLE IF NOT EXISTS tin_sequences (
    table_type      ENUM('Private','International') NOT NULL,
    tin_category    TINYINT UNSIGNED                NOT NULL
                        COMMENT '1=Teacher  2=Clerical  3=Minor',
    last_global     SMALLINT UNSIGNED               NOT NULL DEFAULT 0
                        COMMENT 'Highest tin_teacher_no_global assigned so far',
    updated_at      DATETIME                        NOT NULL
                        DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (table_type, tin_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pre-seed all six combinations so SELECT … FOR UPDATE always finds a row.
INSERT IGNORE INTO tin_sequences (table_type, tin_category, last_global) VALUES
  ('Private',       1, 0),
  ('Private',       2, 0),
  ('Private',       3, 0),
  ('International', 1, 0),
  ('International', 2, 0),
  ('International', 3, 0);
