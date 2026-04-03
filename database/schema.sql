-- ============================================================
-- ARCHBISHOPS' HOUSE SCHOOL MANAGEMENT SYSTEM
-- Full MySQL Schema  |  mysql2 / MySQL 8.0+
-- ============================================================
-- Execution order matters — tables with FKs must come after
-- the tables they reference.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ============================================================
-- 0.  USERS  (referenced by removal-approval table)
--     Full auth schema comes in Prompt 02.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(80)     NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,
    full_name       VARCHAR(150)    NOT NULL,
    role            ENUM(
                        'admin_private',
                        'admin_international',
                        'admin_vested',
                        'principal',
                        'head_of_hr'
                    )               NOT NULL,
    school_type     ENUM('Private','International','Vested') NULL
                        COMMENT 'NULL = system-wide admin',
    school_id       INT UNSIGNED    NULL
                        COMMENT 'NULL = access to all schools of their type',
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    last_login_at   DATETIME        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_users_role       (role),
    INDEX idx_users_school_id  (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 1.  SCHOOLS  (master list — shared across all modules)
--     Covers the "School List" module (school_index 01–32 / 51–55)
-- ============================================================
CREATE TABLE IF NOT EXISTS schools (
    id                          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    -- The leading-zero index used in TIN and legacy CSV  e.g. '01', '26', '51'
    school_index                VARCHAR(5)      NOT NULL UNIQUE,
    school_name                 VARCHAR(200)    NOT NULL,
    school_type                 ENUM(
                                    'Private',
                                    'International',
                                    'Vested'
                                )               NOT NULL,

    -- Contact / admin snapshot (FR-38 "School List" fields)
    -- Note: vested schools carry deeper detail in vested_schools table
    principal_name              VARCHAR(150)    NULL,
    principal_phone             VARCHAR(25)     NULL,
    school_phone                VARCHAR(25)     NULL,

    -- "School Gender" renamed to student_admission_type (Boys / Girls / Mixed)
    student_admission_type      ENUM('Boys','Girls','Mixed') NULL,

    -- Category as used by MOE Sri Lanka  e.g. '1AB', '1C', '2', '3'
    school_category             VARCHAR(20)     NULL,

    email                       VARCHAR(150)    NULL,
    no_of_students              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    no_of_teachers              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    no_of_pensionable_teachers  SMALLINT UNSIGNED NOT NULL DEFAULT 0,

    created_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_schools_type   (school_type),
    INDEX idx_schools_index  (school_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 2.  PRIVATE SCHOOL TEACHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS private_school_teachers (
    id                          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,

    -- ── TIN Components ───────────────────────────────────────
    -- Stored separately so each part can be queried independently.
    -- The merged TIN is a GENERATED STORED column (MySQL 5.7+).
    tin_category                TINYINT UNSIGNED NOT NULL
                                    COMMENT '1=Teacher  2=Clerical Staff  3=Minor Staff',
    tin_school_number           TINYINT UNSIGNED NOT NULL
                                    COMMENT 'Private: 01–32',
    tin_teacher_no_school       SMALLINT UNSIGNED NOT NULL
                                    COMMENT 'Sequence within school',
    tin_teacher_no_global       SMALLINT UNSIGNED NOT NULL
                                    COMMENT 'Sequence across full list',
    -- e.g.  1/026/013/2524
    tin                         VARCHAR(25)
                                    GENERATED ALWAYS AS (
                                        CONCAT(
                                            tin_category, '/',
                                            LPAD(tin_school_number,  3, '0'), '/',
                                            LPAD(tin_teacher_no_school, 3, '0'), '/',
                                            tin_teacher_no_global
                                        )
                                    ) STORED NOT NULL,

    -- ── Category ─────────────────────────────────────────────
    -- 1=Pensionable  2=Unregistered Permanent
    -- 3=Unregistered Teacher Training  4=Fixed Term Contract
    present_category            TINYINT UNSIGNED NOT NULL,

    -- ── Personal Identification ───────────────────────────────
    full_name                   VARCHAR(150)    NOT NULL,
    nic                         VARCHAR(12)     NOT NULL UNIQUE,
    gender                      ENUM('Male','Female','Other') NOT NULL,

    -- date_of_birth stored; age/retirement/service COMPUTED — see computation notes
    date_of_birth               DATE            NOT NULL,

    religion                    VARCHAR(60)     NULL,
    home_address                TEXT            NULL,
    email                       VARCHAR(150)    NULL,

    -- ── Employment ────────────────────────────────────────────
    date_of_first_appointment   DATE            NULL,

    -- FR-36: Prior service (Yes/No)
    service_status              TINYINT(1)      NOT NULL DEFAULT 0
                                    COMMENT '0=No prior service  1=Yes prior service',

    -- Tracks whether the confirmation letter has been issued
    confirmation_letter_status  ENUM(
                                    'Pending',
                                    'Issued',
                                    'Not_Required'
                                )               NOT NULL DEFAULT 'Pending',

    -- ── Training Flags ────────────────────────────────────────
    ssp_status                  ENUM(
                                    'Not_Completed',
                                    'Yes',
                                    'Completed'
                                )               NOT NULL DEFAULT 'Not_Completed',

    dcett_status                ENUM(
                                    'Not_Completed',
                                    'Yes',
                                    'Completed'
                                )               NOT NULL DEFAULT 'Not_Completed',

    -- ── Selection Test (max 3 attempts — FR-26) ───────────────
    selection_test_attempt1     ENUM('Pass','Fail') NULL,
    selection_test_attempt2     ENUM('Pass','Fail') NULL,
    selection_test_attempt3     ENUM('Pass','Fail') NULL,

    -- ── Profile Picture ──────────────────────────────────────
    -- Relative path under the uploads/ directory  (FR-30)
    profile_picture_path        VARCHAR(500)    NULL,

    -- ── Relationships ─────────────────────────────────────────
    school_id                   INT UNSIGNED    NOT NULL,

    -- ── Soft-delete / Removal (FR-19, FR-20) ─────────────────
    -- TIN is NEVER deleted; all other fields can be cleared.
    -- is_active=0 means the row has been cleared (teacher removed).
    is_active                   TINYINT(1)      NOT NULL DEFAULT 1,
    removed_at                  DATETIME        NULL,
    removed_reason              ENUM(
                                    'Resignation',
                                    'Retirement',
                                    'Transfer',
                                    'Qualification_Failure'
                                )               NULL,

    -- ── Audit ─────────────────────────────────────────────────
    created_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_pst_tin           (tin),
    CONSTRAINT fk_pst_school
        FOREIGN KEY (school_id) REFERENCES schools(id),

    INDEX idx_pst_tin            (tin),
    INDEX idx_pst_school         (school_id),
    INDEX idx_pst_nic            (nic),
    INDEX idx_pst_category       (present_category),
    INDEX idx_pst_active         (is_active),
    INDEX idx_pst_tin_category   (tin_category, tin_school_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2a.  Private teacher — phone numbers ─────────────────────
CREATE TABLE IF NOT EXISTS private_teacher_phones (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id      INT UNSIGNED    NOT NULL,
    phone_number    VARCHAR(25)     NOT NULL,
    phone_type      ENUM('Mobile','Home','Work','Other') NOT NULL DEFAULT 'Mobile',
    is_primary      TINYINT(1)      NOT NULL DEFAULT 0,

    CONSTRAINT fk_ptp_teacher
        FOREIGN KEY (teacher_id) REFERENCES private_school_teachers(id)
        ON DELETE CASCADE,
    INDEX idx_ptp_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2b.  Private teacher — contracts (multi-stage) ───────────
--  Matches the three sequential contract stages from the CSV:
--  6-month → 2nd contract → 3rd contract (with its own expiry)
CREATE TABLE IF NOT EXISTS private_teacher_contracts (
    id                      INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id              INT UNSIGNED    NOT NULL UNIQUE,

    -- Stage 1: 6-month probationary contract
    contract_6month_start   DATE            NULL,
    contract_6month_end     DATE            NULL,

    -- Stage 2: 2nd contract
    contract_2nd_start      DATE            NULL,
    contract_2nd_end        DATE            NULL,

    -- Stage 3: 3rd contract
    contract_3rd_start      DATE            NULL,
    contract_3rd_end        DATE            NULL,
    -- FR-23: 3rd contract expiry is tracked explicitly
    contract_3rd_expiry     DATE            NULL,

    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_ptc_teacher
        FOREIGN KEY (teacher_id) REFERENCES private_school_teachers(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2c.  Private teacher — teaching medium (multi-select) ────
CREATE TABLE IF NOT EXISTS private_teacher_mediums (
    id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id  INT UNSIGNED    NOT NULL,
    medium      ENUM('English','Tamil','Sinhala') NOT NULL,

    CONSTRAINT fk_ptmed_teacher
        FOREIGN KEY (teacher_id) REFERENCES private_school_teachers(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_ptmed (teacher_id, medium)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2d.  Private teacher — class levels taught (multi-select) ─
CREATE TABLE IF NOT EXISTS private_teacher_class_levels (
    id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id  INT UNSIGNED    NOT NULL,
    class_level ENUM('1-5','6-11','12-13') NOT NULL,

    CONSTRAINT fk_ptcl_teacher
        FOREIGN KEY (teacher_id) REFERENCES private_school_teachers(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_ptcl (teacher_id, class_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2e.  Private teacher — education qualifications ───────────
CREATE TABLE IF NOT EXISTS private_teacher_education (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id      INT UNSIGNED    NOT NULL,
    qualification   ENUM(
                        'A/L',
                        'Graduate',
                        'MA',
                        'PhD',
                        'Other'
                    )               NOT NULL,
    -- Free-text detail when qualification = 'Other'
    other_detail    VARCHAR(150)    NULL,

    CONSTRAINT fk_ptedu_teacher
        FOREIGN KEY (teacher_id) REFERENCES private_school_teachers(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_ptedu (teacher_id, qualification)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2f.  Private teacher — professional qualifications ────────
CREATE TABLE IF NOT EXISTS private_teacher_professional_qualifications (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id      INT UNSIGNED    NOT NULL,
    -- Free text; values come from CSV (e.g. PGDE, B.Ed, Dip.Ed)
    qualification   VARCHAR(200)    NOT NULL,

    CONSTRAINT fk_ptpq_teacher
        FOREIGN KEY (teacher_id) REFERENCES private_school_teachers(id)
        ON DELETE CASCADE,
    INDEX idx_ptpq_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2g.  Private teacher — subjects (multi-select) ────────────
CREATE TABLE IF NOT EXISTS private_teacher_subjects (
    id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id  INT UNSIGNED    NOT NULL,
    subject     VARCHAR(100)    NOT NULL,

    CONSTRAINT fk_ptsub_teacher
        FOREIGN KEY (teacher_id) REFERENCES private_school_teachers(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_ptsub (teacher_id, subject),
    INDEX idx_ptsub_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2h.  Teacher removal approvals (FR-20: dual admin approval) ─
CREATE TABLE IF NOT EXISTS teacher_removal_approvals (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    -- teacher_type distinguishes Private vs International
    teacher_type    ENUM('Private','International') NOT NULL,
    teacher_id      INT UNSIGNED    NOT NULL,
    reason          ENUM(
                        'Resignation',
                        'Retirement',
                        'Transfer',
                        'Qualification_Failure'
                    )               NOT NULL,
    requested_by    INT UNSIGNED    NOT NULL COMMENT 'users.id of first admin',
    approved_by     INT UNSIGNED    NULL     COMMENT 'users.id of second admin',
    status          ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
    requested_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at     DATETIME        NULL,
    rejection_note  VARCHAR(255)    NULL,

    CONSTRAINT fk_tra_requested_by
        FOREIGN KEY (requested_by) REFERENCES users(id),
    CONSTRAINT fk_tra_approved_by
        FOREIGN KEY (approved_by)  REFERENCES users(id),

    INDEX idx_tra_teacher  (teacher_type, teacher_id),
    INDEX idx_tra_status   (status),
    INDEX idx_tra_req_by   (requested_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 3.  INTERNATIONAL SCHOOL TEACHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS international_school_teachers (
    id                          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,

    -- ── TIN Components (school_number range 51–55) ────────────
    tin_category                TINYINT UNSIGNED NOT NULL
                                    COMMENT '1=Teacher  2=Clerical  3=Minor',
    tin_school_number           TINYINT UNSIGNED NOT NULL
                                    COMMENT 'International: 51–55',
    tin_teacher_no_school       SMALLINT UNSIGNED NOT NULL,
    tin_teacher_no_global       SMALLINT UNSIGNED NOT NULL,
    tin                         VARCHAR(25)
                                    GENERATED ALWAYS AS (
                                        CONCAT(
                                            tin_category, '/',
                                            LPAD(tin_school_number,  3, '0'), '/',
                                            LPAD(tin_teacher_no_school, 3, '0'), '/',
                                            tin_teacher_no_global
                                        )
                                    ) STORED NOT NULL,

    -- ── Category ─────────────────────────────────────────────
    category                    ENUM(
                                    'Permanent',
                                    'Fixed_Term_Contract'
                                )               NOT NULL,

    -- ── Personal Details ──────────────────────────────────────
    full_name                   VARCHAR(150)    NOT NULL,
    designation                 VARCHAR(100)    NULL,
    nic                         VARCHAR(12)     NOT NULL UNIQUE,
    religion                    VARCHAR(60)     NULL,
    address                     TEXT            NULL,
    email                       VARCHAR(150)    NULL,

    -- date_of_birth stored; present_service & retirement_date COMPUTED
    date_of_birth               DATE            NOT NULL,

    -- ── Employment ────────────────────────────────────────────
    date_of_first_appointment   DATE            NULL,
    -- present_service  → COMPUTED  (see computation notes)
    -- retirement_date  → COMPUTED  (see computation notes)

    -- ── Relationships ─────────────────────────────────────────
    school_id                   INT UNSIGNED    NOT NULL,

    -- ── Soft-delete / Removal ─────────────────────────────────
    is_active                   TINYINT(1)      NOT NULL DEFAULT 1,
    removed_at                  DATETIME        NULL,
    removed_reason              ENUM(
                                    'Resignation',
                                    'Retirement',
                                    'Transfer',
                                    'Qualification_Failure'
                                )               NULL,

    -- ── Audit ─────────────────────────────────────────────────
    created_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_ist_tin           (tin),
    CONSTRAINT fk_ist_school
        FOREIGN KEY (school_id) REFERENCES schools(id),

    INDEX idx_ist_tin         (tin),
    INDEX idx_ist_school      (school_id),
    INDEX idx_ist_nic         (nic),
    INDEX idx_ist_category    (category),
    INDEX idx_ist_active      (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 3a.  International teacher — phone numbers ───────────────
CREATE TABLE IF NOT EXISTS international_teacher_phones (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id      INT UNSIGNED    NOT NULL,
    phone_number    VARCHAR(25)     NOT NULL,
    phone_type      ENUM('Mobile','Home','Work','Other') NOT NULL DEFAULT 'Mobile',
    is_primary      TINYINT(1)      NOT NULL DEFAULT 0,

    CONSTRAINT fk_itp_teacher
        FOREIGN KEY (teacher_id) REFERENCES international_school_teachers(id)
        ON DELETE CASCADE,
    INDEX idx_itp_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 3b.  International teacher — contracts ────────────────────
--  International: Permanent has 6-month probation period.
CREATE TABLE IF NOT EXISTS international_teacher_contracts (
    id                      INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    teacher_id              INT UNSIGNED    NOT NULL UNIQUE,

    -- Probation / first 6-month period (Permanent category)
    probation_start         DATE            NULL,
    probation_end           DATE            NULL,

    -- Fixed-term contract details (Fixed_Term_Contract category)
    contract_start          DATE            NULL,
    contract_end            DATE            NULL,
    contract_expiry         DATE            NULL,

    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_itc_teacher
        FOREIGN KEY (teacher_id) REFERENCES international_school_teachers(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 4.  VESTED SCHOOLS  (extended school data)
--     Every vested school also has a row in `schools`.
-- ============================================================
CREATE TABLE IF NOT EXISTS vested_schools (
    id                              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    -- 1-to-1 extension of the schools master table
    school_id                       INT UNSIGNED    NOT NULL UNIQUE,

    -- ── Administrative / Location ─────────────────────────────
    province                        VARCHAR(100)    NULL,
    district                        VARCHAR(100)    NULL,
    education_zone                  VARCHAR(100)    NULL,
    divisional_secretariat          VARCHAR(100)    NULL,
    parish                          VARCHAR(100)    NULL,
    zone                            VARCHAR(100)
                                        COMMENT 'Church/pastoral zone',
    region                          VARCHAR(100)    NULL,

    -- ── School Metadata ───────────────────────────────────────
    school_address                  TEXT            NULL,
    school_phone                    VARCHAR(25)     NULL,
    school_fax                      VARCHAR(25)     NULL,
    school_email                    VARCHAR(150)    NULL,
    school_census_no                VARCHAR(20)     NULL
                                        COMMENT 'MOE census / registration number',
    year_established                YEAR            NULL,
    school_type_detail              VARCHAR(100)    NULL
                                        COMMENT 'e.g. National, Provincial',
    -- student_admission_type and school_category mirrored from schools
    -- for reporting convenience (denormalised intentionally)
    student_admission_type          ENUM('Boys','Girls','Mixed') NULL,
    school_category                 VARCHAR(20)     NULL,
    medium_of_instruction           VARCHAR(100)    NULL
                                        COMMENT 'Sinhala / Tamil / English / Bilingual',

    -- ── Bishop Oswal Gomis Target Percentages ────────────────
    -- Set once; updated when bishop issues new directives.
    bog_catholic_pct                DECIMAL(5,2)    NULL,
    bog_other_christian_pct         DECIMAL(5,2)    NULL,
    bog_buddhist_pct                DECIMAL(5,2)    NULL,
    bog_hindu_pct                   DECIMAL(5,2)    NULL,
    bog_islam_pct                   DECIMAL(5,2)    NULL,
    bog_other_religion_pct          DECIMAL(5,2)    NULL,

    -- ── Overview / Free-text Fields ───────────────────────────
    overview_general                TEXT            NULL,
    overview_remarks                TEXT            NULL,
    overview_special_notes          TEXT            NULL,
    overview_challenges             TEXT            NULL,

    -- ── Audit ─────────────────────────────────────────────────
    created_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_vs_school
        FOREIGN KEY (school_id) REFERENCES schools(id),

    INDEX idx_vs_province   (province),
    INDEX idx_vs_district   (district),
    INDEX idx_vs_zone       (zone),
    INDEX idx_vs_region     (region)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 4a.  Vested school — principals (current + archived) ─────
CREATE TABLE IF NOT EXISTS vested_school_principals (
    id                              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    vested_school_id                INT UNSIGNED    NOT NULL,

    -- ── Identity ──────────────────────────────────────────────
    full_name                       VARCHAR(150)    NOT NULL,
    nic                             VARCHAR(12)     NULL,
    gender                          ENUM('Male','Female','Other') NULL,
    religion                        VARCHAR(60)     NULL,
    date_of_birth                   DATE            NULL,

    -- ── Service ───────────────────────────────────────────────
    first_appointment_date          DATE            NULL
                                        COMMENT 'Date of very first appointment anywhere',
    appointment_to_present_school   DATE            NULL,
    -- FR-51: retirement_date stored (user explicitly listed it)
    retirement_date                 DATE            NULL,

    -- ── Contact ───────────────────────────────────────────────
    phone                           VARCHAR(25)     NULL,
    email                           VARCHAR(150)    NULL,

    -- ── Archive Status (FR-50) ───────────────────────────────
    is_current                      TINYINT(1)      NOT NULL DEFAULT 1
                                        COMMENT '1=current  0=past/archived',
    end_date                        DATE            NULL
                                        COMMENT 'Date principal departed this school',
    departure_reason                VARCHAR(150)    NULL,

    -- ── Audit ─────────────────────────────────────────────────
    created_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_vsp_school
        FOREIGN KEY (vested_school_id) REFERENCES vested_schools(id),

    INDEX idx_vsp_school    (vested_school_id),
    INDEX idx_vsp_current   (is_current),
    INDEX idx_vsp_religion  (religion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 4b.  Vested school — yearly student statistics ───────────
--  One row per school per year (FR-53: allow yearly updates).
--  Percentages (religion ratios) are COMPUTED at query time:
--    e.g.  pct_catholic = (count_catholic / total_students) * 100
CREATE TABLE IF NOT EXISTS vested_school_student_stats (
    id                      INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    vested_school_id        INT UNSIGNED    NOT NULL,
    stat_year               YEAR            NOT NULL,

    -- ── Religion Counts ───────────────────────────────────────
    count_catholic          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    count_other_christian   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    count_buddhist          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    count_hindu             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    count_islam             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    count_other_religion    SMALLINT UNSIGNED NOT NULL DEFAULT 0,

    -- ── Medium Counts ─────────────────────────────────────────
    count_sinhala_medium    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    count_tamil_medium      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    count_english_medium    SMALLINT UNSIGNED NOT NULL DEFAULT 0,

    -- ── Aggregate Totals ──────────────────────────────────────
    total_students          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    total_teachers          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    total_classes           SMALLINT UNSIGNED NOT NULL DEFAULT 0,

    -- ── Audit ─────────────────────────────────────────────────
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_vsss_school
        FOREIGN KEY (vested_school_id) REFERENCES vested_schools(id),

    UNIQUE KEY uq_vsss_year (vested_school_id, stat_year),
    INDEX idx_vsss_year     (stat_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 5.  RECTORS
-- ============================================================
CREATE TABLE IF NOT EXISTS rectors (
    id                              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    rector_no                       SMALLINT UNSIGNED NOT NULL UNIQUE
                                        COMMENT 'The "No." column in the CSV',
    full_name                       VARCHAR(150)    NOT NULL,
    present_school_id               INT UNSIGNED    NULL,

    registration_status             ENUM(
                                        'Registered',
                                        'Unregistered',
                                        'Pending'
                                    )               NOT NULL DEFAULT 'Pending',

    date_of_birth                   DATE            NULL,
    first_appointment_date          DATE            NULL,
    appointment_to_present_school   DATE            NULL,
    -- Retirement date listed as a field in the CSV — stored directly
    retirement_date                 DATE            NULL,

    created_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_rec_school
        FOREIGN KEY (present_school_id) REFERENCES schools(id)
        ON DELETE SET NULL,

    INDEX idx_rec_school      (present_school_id),
    INDEX idx_rec_retirement  (retirement_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 5a.  Rector — education qualifications (multi-select) ─────
CREATE TABLE IF NOT EXISTS rector_qualifications (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    rector_id       INT UNSIGNED    NOT NULL,
    -- Free text to accommodate CSV diversity (e.g. B.Th, M.Div, PhD, etc.)
    qualification   VARCHAR(200)    NOT NULL,

    CONSTRAINT fk_rq_rector
        FOREIGN KEY (rector_id) REFERENCES rectors(id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_rq (rector_id, qualification(100)),
    INDEX idx_rq_rector (rector_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 6.  FATHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS fathers (
    id                              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    father_no                       SMALLINT UNSIGNED NOT NULL UNIQUE
                                        COMMENT 'The "No." column in the CSV',
    full_name                       VARCHAR(150)    NOT NULL,

    -- school_id nullable: a Father may not be assigned to a school
    school_id                       INT UNSIGNED    NULL,

    registration                    VARCHAR(100)    NULL,

    -- ordination may arrive as a year or a full date from CSV
    ordination_date                 DATE            NULL,

    first_appointment_date          DATE            NULL,

    present_school_appointment_date DATE            NULL,

    -- total_service COMPUTED — see computation notes below
    -- five_year_completion: the calendar date when 5 years of service complete
    five_year_completion            DATE            NULL,

    evaluation                      TEXT            NULL,

    created_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_fat_school
        FOREIGN KEY (school_id) REFERENCES schools(id)
        ON DELETE SET NULL,

    INDEX idx_fat_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 6a.  Father — qualifications (multi-select) ───────────────
CREATE TABLE IF NOT EXISTS father_qualifications (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    father_id       INT UNSIGNED    NOT NULL,
    qualification   VARCHAR(200)    NOT NULL,

    CONSTRAINT fk_fq_father
        FOREIGN KEY (father_id) REFERENCES fathers(id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_fq (father_id, qualification(100)),
    INDEX idx_fq_father (father_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 7.  DOCUMENTS  (ACPS / ACIS PDF storage — FR-31 to FR-34)
--     Full implementation in Prompt 06; table defined here
--     so FKs can reference it from day one.
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    -- Owner can be a private or international teacher
    owner_type      ENUM('Private','International') NOT NULL,
    owner_id        INT UNSIGNED    NOT NULL,
    -- e.g. ACPS_01, ACPS_04, ACIS_03
    form_code       VARCHAR(20)     NOT NULL,
    original_name   VARCHAR(255)    NOT NULL,
    stored_path     VARCHAR(500)    NOT NULL,
    mime_type       VARCHAR(100)    NOT NULL DEFAULT 'application/pdf',
    file_size_bytes INT UNSIGNED    NULL,
    -- FR-34: some forms are restricted to admins only
    admin_only      TINYINT(1)      NOT NULL DEFAULT 0,
    uploaded_by     INT UNSIGNED    NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_doc_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users(id),

    INDEX idx_doc_owner     (owner_type, owner_id),
    INDEX idx_doc_form_code (form_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SET FOREIGN_KEY_CHECKS = 1;
