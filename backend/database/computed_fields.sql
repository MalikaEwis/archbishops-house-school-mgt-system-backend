-- ============================================================
-- COMPUTED FIELDS — Query Reference
-- These values are NEVER stored in the DB.
-- Use these expressions in SELECT statements or application code.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- A.  AGE
--     Applies to: private_school_teachers, international_school_teachers,
--                 vested_school_principals, rectors, fathers
-- ─────────────────────────────────────────────────────────────
-- Plain years
SELECT TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age
FROM   private_school_teachers
WHERE  id = :teacher_id;

-- ─────────────────────────────────────────────────────────────
-- B.  RETIREMENT DATE  (not stored for Private / International teachers)
--     Sri Lankan public service retirement age = 60 years.
--     Adjust the INTERVAL if a category uses a different age.
-- ─────────────────────────────────────────────────────────────
SELECT DATE_ADD(date_of_birth, INTERVAL 60 YEAR) AS retirement_date
FROM   private_school_teachers
WHERE  id = :teacher_id;

-- ─────────────────────────────────────────────────────────────
-- C.  RETIRING AFTER  (Years / Months / Days)
-- ─────────────────────────────────────────────────────────────
SELECT
    -- Full years remaining
    TIMESTAMPDIFF(
        YEAR,
        CURDATE(),
        DATE_ADD(date_of_birth, INTERVAL 60 YEAR)
    ) AS retiring_in_years,

    -- Remaining months after subtracting full years
    MOD(
        TIMESTAMPDIFF(MONTH, CURDATE(), DATE_ADD(date_of_birth, INTERVAL 60 YEAR)),
        12
    ) AS retiring_in_months,

    -- Remaining days after subtracting full months
    DATEDIFF(
        DATE_ADD(date_of_birth, INTERVAL 60 YEAR),
        DATE_ADD(
            CURDATE(),
            INTERVAL TIMESTAMPDIFF(MONTH, CURDATE(), DATE_ADD(date_of_birth, INTERVAL 60 YEAR)) MONTH
        )
    ) AS retiring_in_days

FROM private_school_teachers
WHERE id = :teacher_id;

-- ─────────────────────────────────────────────────────────────
-- D.  PRESENT SERVICE  (Years / Months / Days from first appointment)
-- ─────────────────────────────────────────────────────────────
SELECT
    TIMESTAMPDIFF(YEAR,  date_of_first_appointment, CURDATE()) AS service_years,
    MOD(TIMESTAMPDIFF(MONTH, date_of_first_appointment, CURDATE()), 12) AS service_months,
    DATEDIFF(
        CURDATE(),
        DATE_ADD(
            date_of_first_appointment,
            INTERVAL TIMESTAMPDIFF(MONTH, date_of_first_appointment, CURDATE()) MONTH
        )
    ) AS service_days
FROM private_school_teachers   -- same for international_school_teachers
WHERE id = :teacher_id;

-- ─────────────────────────────────────────────────────────────
-- E.  SERVICE TIME AT RETIREMENT
--     = service between first appointment and computed retirement date
-- ─────────────────────────────────────────────────────────────
SELECT
    TIMESTAMPDIFF(
        YEAR,
        date_of_first_appointment,
        DATE_ADD(date_of_birth, INTERVAL 60 YEAR)
    ) AS service_at_retirement_years
FROM private_school_teachers
WHERE id = :teacher_id;

-- ─────────────────────────────────────────────────────────────
-- F.  TOTAL SERVICE  (Fathers)
-- ─────────────────────────────────────────────────────────────
SELECT
    TIMESTAMPDIFF(YEAR,  first_appointment_date, CURDATE()) AS total_service_years,
    MOD(TIMESTAMPDIFF(MONTH, first_appointment_date, CURDATE()), 12) AS total_service_months,
    DATEDIFF(
        CURDATE(),
        DATE_ADD(
            first_appointment_date,
            INTERVAL TIMESTAMPDIFF(MONTH, first_appointment_date, CURDATE()) MONTH
        )
    ) AS total_service_days
FROM fathers
WHERE id = :father_id;

-- ─────────────────────────────────────────────────────────────
-- G.  STUDENT RELIGION PERCENTAGES  (Vested Schools)
--     Compute at query time from vested_school_student_stats.
-- ─────────────────────────────────────────────────────────────
SELECT
    stat_year,
    total_students,
    ROUND((count_catholic        / NULLIF(total_students, 0)) * 100, 2) AS pct_catholic,
    ROUND((count_other_christian / NULLIF(total_students, 0)) * 100, 2) AS pct_other_christian,
    ROUND((count_buddhist        / NULLIF(total_students, 0)) * 100, 2) AS pct_buddhist,
    ROUND((count_hindu           / NULLIF(total_students, 0)) * 100, 2) AS pct_hindu,
    ROUND((count_islam           / NULLIF(total_students, 0)) * 100, 2) AS pct_islam,
    ROUND((count_other_religion  / NULLIF(total_students, 0)) * 100, 2) AS pct_other_religion,
    -- Bishop Oswal Gomis gap (actual - target)
    ROUND((count_catholic / NULLIF(total_students, 0)) * 100, 2)
        - vs.bog_catholic_pct                                            AS bog_catholic_gap
FROM vested_school_student_stats  vsss
JOIN vested_schools               vs   ON vs.id = vsss.vested_school_id
WHERE vsss.vested_school_id = :school_id
ORDER BY vsss.stat_year DESC;
