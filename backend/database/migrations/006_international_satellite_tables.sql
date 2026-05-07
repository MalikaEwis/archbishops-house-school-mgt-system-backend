-- ============================================================
-- Migration 006 – International teacher satellite tables
-- ============================================================
-- Run AFTER schema.sql and migrations 001–005.
-- Idempotent: all statements use IF NOT EXISTS / IGNORE.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ── Satellite table: teaching mediums ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS international_teacher_mediums (
    id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id  INT UNSIGNED    NOT NULL,
    medium      ENUM('English','Tamil','Sinhala') NOT NULL,

    CONSTRAINT fk_itmed_teacher
        FOREIGN KEY (teacher_id) REFERENCES international_school_teachers(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_itmed (teacher_id, medium)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Satellite table: class levels ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS international_teacher_class_levels (
    id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id  INT UNSIGNED    NOT NULL,
    class_level ENUM('1-5','6-11','12-13') NOT NULL,

    CONSTRAINT fk_itcl_teacher
        FOREIGN KEY (teacher_id) REFERENCES international_school_teachers(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_itcl (teacher_id, class_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Satellite table: education qualifications ────────────────────────────────
CREATE TABLE IF NOT EXISTS international_teacher_education (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id      INT UNSIGNED    NOT NULL,
    qualification   ENUM('A/L','Graduate','MA','PhD','Other') NOT NULL,
    other_detail    VARCHAR(150)    NULL,

    CONSTRAINT fk_itedu_teacher
        FOREIGN KEY (teacher_id) REFERENCES international_school_teachers(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_itedu (teacher_id, qualification)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Satellite table: professional qualifications (free text) ─────────────────
CREATE TABLE IF NOT EXISTS international_teacher_professional_qualifications (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id      INT UNSIGNED    NOT NULL,
    qualification   VARCHAR(200)    NOT NULL,

    CONSTRAINT fk_itpq_teacher
        FOREIGN KEY (teacher_id) REFERENCES international_school_teachers(id)
        ON DELETE CASCADE,
    INDEX idx_itpq_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Satellite table: subjects ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS international_teacher_subjects (
    id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id  INT UNSIGNED    NOT NULL,
    subject     VARCHAR(100)    NOT NULL,

    CONSTRAINT fk_itsub_teacher
        FOREIGN KEY (teacher_id) REFERENCES international_school_teachers(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_itsub (teacher_id, subject),
    INDEX idx_itsub_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
