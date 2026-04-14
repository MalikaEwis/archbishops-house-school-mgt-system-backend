# CSV → MySQL Mapping Guide

## General Rules

1. **One CSV row = One primary table row** — satellite rows (phones, qualifications, contracts, stats) are inserted in separate passes.
2. **String cleaning** — trim whitespace, collapse multiple spaces, normalise to UTF-8 before insert.
3. **Date normalisation** — parse all date strings to `YYYY-MM-DD` before insert regardless of CSV format (`DD/MM/YYYY`, `MM-DD-YY`, etc.).
4. **NULL handling** — empty CSV cells become SQL `NULL`, never empty string `''`.
5. **Duplicate detection** — use `NIC` and `TIN` as natural unique keys.

---

## Module 1 — Private School Teachers

| CSV Column | Table | Column | Notes |
|---|---|---|---|
| TIN (merged e.g. `1/026/013/2524`) | `private_school_teachers` | `tin_category`, `tin_school_number`, `tin_teacher_no_school`, `tin_teacher_no_global` | **Split** on `/`; the `tin` generated column is auto-computed |
| Present Category | `private_school_teachers` | `present_category` | Map text → 1/2/3/4 |
| Full Name | `private_school_teachers` | `full_name` | |
| NIC | `private_school_teachers` | `nic` | Deduplicate before import |
| Gender | `private_school_teachers` | `gender` | Normalise M→Male, F→Female |
| Date of Birth | `private_school_teachers` | `date_of_birth` | Parse to DATE |
| Religion | `private_school_teachers` | `religion` | |
| Home Address | `private_school_teachers` | `home_address` | |
| Email | `private_school_teachers` | `email` | |
| Date of First Appointment | `private_school_teachers` | `date_of_first_appointment` | |
| Service Status | `private_school_teachers` | `service_status` | Yes→1, No→0 |
| Confirmation Letter Status | `private_school_teachers` | `confirmation_letter_status` | Map to ENUM |
| SSP Status | `private_school_teachers` | `ssp_status` | Map to ENUM |
| DCETT Status | `private_school_teachers` | `dcett_status` | Map to ENUM |
| Selection Test Attempt 1 | `private_school_teachers` | `selection_test_attempt1` | Pass/Fail or NULL |
| Selection Test Attempt 2 | `private_school_teachers` | `selection_test_attempt2` | |
| Selection Test Attempt 3 | `private_school_teachers` | `selection_test_attempt3` | |
| Phone 1, Phone 2, Phone 3 | `private_teacher_phones` | `phone_number` | One INSERT per non-empty cell; first phone gets `is_primary=1` |
| 6-Month Contract Start/End | `private_teacher_contracts` | `contract_6month_start/end` | One row per teacher |
| 2nd Contract Start/End | `private_teacher_contracts` | `contract_2nd_start/end` | |
| 3rd Contract Start/End/Expiry | `private_teacher_contracts` | `contract_3rd_start/end`, `contract_3rd_expiry` | |
| Medium (pipe-separated) | `private_teacher_mediums` | `medium` | Split `"English\|Tamil"` → two rows |
| Class Levels | `private_teacher_class_levels` | `class_level` | Split delimited list |
| Education | `private_teacher_education` | `qualification` | Map to ENUM |
| Professional Qualifications | `private_teacher_professional_qualifications` | `qualification` | One row per qualification |
| Subjects | `private_teacher_subjects` | `subject` | Split comma/pipe list |

---

## Module 2 — International School Teachers

| CSV Column | Table | Column | Notes |
|---|---|---|---|
| TIN | `international_school_teachers` | `tin_*` components | Same split logic as Private |
| Category | `international_school_teachers` | `category` | Permanent / Fixed_Term_Contract |
| Full Name | `international_school_teachers` | `full_name` | |
| Designation | `international_school_teachers` | `designation` | |
| NIC | `international_school_teachers` | `nic` | |
| Religion | `international_school_teachers` | `religion` | |
| Address | `international_school_teachers` | `address` | |
| Email | `international_school_teachers` | `email` | |
| Date of Birth | `international_school_teachers` | `date_of_birth` | |
| Date of First Appointment | `international_school_teachers` | `date_of_first_appointment` | |
| Present Service | **NOT stored** | — | Computed: `TIMESTAMPDIFF(YEAR, date_of_first_appointment, CURDATE())` |
| Retirement Date | **NOT stored** | — | Computed: `DATE_ADD(date_of_birth, INTERVAL 60 YEAR)` |
| Phones | `international_teacher_phones` | `phone_number` | Same pattern as Private |

---

## Module 3 — School List

| CSV Column | Table | Column | Notes |
|---|---|---|---|
| Index (01–32 / 51–55) | `schools` | `school_index` | Pad to 2 digits with LPAD |
| School Name | `schools` | `school_name` | |
| School Type | `schools` | `school_type` | Private/International/Vested |
| Principal Name | `schools` | `principal_name` | |
| Principal Phone | `schools` | `principal_phone` | |
| School Phone | `schools` | `school_phone` | |
| School Gender | `schools` | `student_admission_type` | **Renamed**; map Boys/Girls/Mixed |
| Category of School | `schools` | `school_category` | e.g. 1AB, 1C, 2, 3 |
| Email | `schools` | `email` | |
| No of Students | `schools` | `no_of_students` | Cast to INT |
| No of Teachers | `schools` | `no_of_teachers` | |
| No of Pensionable Teachers | `schools` | `no_of_pensionable_teachers` | |

---

## Module 4 — Rectors

| CSV Column | Table | Column | Notes |
|---|---|---|---|
| No | `rectors` | `rector_no` | |
| Name | `rectors` | `full_name` | |
| Present School | `rectors` | `present_school_id` | Resolve school name → `schools.id` via lookup |
| Registration Status | `rectors` | `registration_status` | Map to ENUM |
| DOB | `rectors` | `date_of_birth` | |
| First Appointment Date | `rectors` | `first_appointment_date` | |
| Appointment to Present School | `rectors` | `appointment_to_present_school` | |
| Retirement Date | `rectors` | `retirement_date` | |
| Education Qualifications | `rector_qualifications` | `qualification` | One row per value in multi-select cell |

---

## Module 5 — Fathers

| CSV Column | Table | Column | Notes |
|---|---|---|---|
| No | `fathers` | `father_no` | |
| Name | `fathers` | `full_name` | |
| School Name | `fathers` | `school_id` | Resolve school name → `schools.id` |
| Registration | `fathers` | `registration` | |
| Ordination | `fathers` | `ordination_date` | Parse year-only values as YYYY-01-01 |
| First Appointment | `fathers` | `first_appointment_date` | |
| Present School Appointment | `fathers` | `present_school_appointment_date` | |
| Total Service | **NOT stored** | — | Computed: `TIMESTAMPDIFF(YEAR, first_appointment_date, CURDATE())` |
| 5 Year Completion | `fathers` | `five_year_completion` | Store the date; compute "completed?" in app |
| Evaluation | `fathers` | `evaluation` | |
| Qualifications | `father_qualifications` | `qualification` | One row per value |

---

## Module 6 — Vested Schools

| CSV Column | Table | Column | Notes |
|---|---|---|---|
| School Name | `schools` + `vested_schools` | — | Insert into both; `vested_schools.school_id` links them |
| Province / Region | `vested_schools` | `province`, `region` | |
| District | `vested_schools` | `district` | |
| Education Zone | `vested_schools` | `education_zone` | |
| Divisional Secretariat | `vested_schools` | `divisional_secretariat` | |
| Parish | `vested_schools` | `parish` | |
| Zone | `vested_schools` | `zone` | |
| Address / Phone / Fax / Email | `vested_schools` | respective columns | |
| School Census No | `vested_schools` | `school_census_no` | |
| Year Established | `vested_schools` | `year_established` | |
| Type / Category / Admission / Medium | `vested_schools` | respective columns | |
| BOG % fields | `vested_schools` | `bog_*_pct` | Cast string % to DECIMAL |
| Overview / Remarks / Notes | `vested_schools` | `overview_*` | |
| Principal fields | `vested_school_principals` | all columns | `is_current=1` for the current principal |
| Past principals | `vested_school_principals` | all columns | `is_current=0`; set `end_date` |
| Year, religion counts, medium counts | `vested_school_student_stats` | respective columns | One row per year per school |

---

## Import Sequence (dependency order)

```
1. schools
2. users                            (needed for document.uploaded_by FK)
3. vested_schools                   (extends schools)
4. vested_school_principals
5. vested_school_student_stats
6. private_school_teachers
7. private_teacher_phones
8. private_teacher_contracts
9. private_teacher_mediums
10. private_teacher_class_levels
11. private_teacher_education
12. private_teacher_professional_qualifications
13. private_teacher_subjects
14. international_school_teachers
15. international_teacher_phones
16. international_teacher_contracts
17. rectors
18. rector_qualifications
19. fathers
20. father_qualifications
```
