import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchVestedSchool,
  createVestedSchool,
  updateVestedSchool,
} from "../../api/vestedSchools";
import styles from "../private/TeacherFormPage.module.css";

const EMPTY_FORM = {
  // Basic Information
  school_index: "",
  school_name: "",
  school_category: "",
  student_admission_type: "",
  medium_of_instruction: "",
  school_type_detail: "",
  year_established: "",
  school_census_no: "",
  no_of_students: "",
  no_of_teachers: "",
  no_of_pensionable_teachers: "",
  // Location
  province: "",
  district: "",
  region: "",
  zone: "",
  education_zone: "",
  divisional_secretariat: "",
  parish: "",
  school_address: "",
  // Contact
  school_phone: "",
  school_fax: "",
  school_email: "",
  // BOG Religion Breakdown
  bog_catholic_pct: "",
  bog_other_christian_pct: "",
  bog_buddhist_pct: "",
  bog_hindu_pct: "",
  bog_islam_pct: "",
  bog_other_religion_pct: "",
  // Remarks
  overview_general: "",
  overview_remarks: "",
  overview_special_notes: "",
  overview_challenges: "",
};

function toStr(val) {
  if (val == null) return "";
  return String(val);
}

function strOrNull(val) {
  return val.trim() === "" ? null : val.trim();
}

function numOrNull(val) {
  if (val === "" || val == null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export default function VestedSchoolFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [fields, setFields] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Load existing school for edit mode ─────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    fetchVestedSchool(id)
      .then((school) => {
        setFields({
          school_index: toStr(school.school_index),
          school_name: toStr(school.school_name),
          school_category: toStr(school.school_category),
          student_admission_type: toStr(school.student_admission_type),
          medium_of_instruction: toStr(school.medium_of_instruction),
          school_type_detail: toStr(school.school_type_detail),
          year_established: toStr(school.year_established),
          school_census_no: toStr(school.school_census_no),
          no_of_students: toStr(school.no_of_students),
          no_of_teachers: toStr(school.no_of_teachers),
          no_of_pensionable_teachers: toStr(school.no_of_pensionable_teachers),
          province: toStr(school.province),
          district: toStr(school.district),
          region: toStr(school.region),
          zone: toStr(school.zone),
          education_zone: toStr(school.education_zone),
          divisional_secretariat: toStr(school.divisional_secretariat),
          parish: toStr(school.parish),
          school_address: toStr(school.school_address),
          school_phone: toStr(school.school_phone),
          school_fax: toStr(school.school_fax),
          school_email: toStr(school.school_email),
          bog_catholic_pct: toStr(school.bog_catholic_pct),
          bog_other_christian_pct: toStr(school.bog_other_christian_pct),
          bog_buddhist_pct: toStr(school.bog_buddhist_pct),
          bog_hindu_pct: toStr(school.bog_hindu_pct),
          bog_islam_pct: toStr(school.bog_islam_pct),
          bog_other_religion_pct: toStr(school.bog_other_religion_pct),
          overview_general: toStr(school.overview_general),
          overview_remarks: toStr(school.overview_remarks),
          overview_special_notes: toStr(school.overview_special_notes),
          overview_challenges: toStr(school.overview_challenges),
        });
      })
      .catch((err) =>
        setError(err.response?.data?.message ?? "Failed to load school."),
      )
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function handleChange(e) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  const canSubmit =
    !submitting && fields.school_index.trim() && fields.school_name.trim();

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const body = {
        school_index: fields.school_index.trim(),
        school_name: fields.school_name.trim(),
        school_category: strOrNull(fields.school_category),
        student_admission_type: strOrNull(fields.student_admission_type),
        medium_of_instruction: strOrNull(fields.medium_of_instruction),
        school_type_detail: strOrNull(fields.school_type_detail),
        year_established: numOrNull(fields.year_established),
        school_census_no: strOrNull(fields.school_census_no),
        no_of_students: numOrNull(fields.no_of_students),
        no_of_teachers: numOrNull(fields.no_of_teachers),
        no_of_pensionable_teachers: numOrNull(
          fields.no_of_pensionable_teachers,
        ),
        province: strOrNull(fields.province),
        district: strOrNull(fields.district),
        region: strOrNull(fields.region),
        zone: strOrNull(fields.zone),
        education_zone: strOrNull(fields.education_zone),
        divisional_secretariat: strOrNull(fields.divisional_secretariat),
        parish: strOrNull(fields.parish),
        school_address: strOrNull(fields.school_address),
        school_phone: strOrNull(fields.school_phone),
        school_fax: strOrNull(fields.school_fax),
        school_email: strOrNull(fields.school_email),
        bog_catholic_pct: numOrNull(fields.bog_catholic_pct),
        bog_other_christian_pct: numOrNull(fields.bog_other_christian_pct),
        bog_buddhist_pct: numOrNull(fields.bog_buddhist_pct),
        bog_hindu_pct: numOrNull(fields.bog_hindu_pct),
        bog_islam_pct: numOrNull(fields.bog_islam_pct),
        bog_other_religion_pct: numOrNull(fields.bog_other_religion_pct),
        overview_general: strOrNull(fields.overview_general),
        overview_remarks: strOrNull(fields.overview_remarks),
        overview_special_notes: strOrNull(fields.overview_special_notes),
        overview_challenges: strOrNull(fields.overview_challenges),
      };

      if (isEdit) {
        await updateVestedSchool(id, body);
        navigate(`/vested/schools/${id}`);
      } else {
        await createVestedSchool(body);
        navigate("/vested/schools");
      }
    } catch (err) {
      setError(
        err.response?.data?.message ??
          `Failed to ${isEdit ? "update" : "create"} school.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingMsg}>Loading school…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        {isEdit ? "Edit School" : "Create School"}
      </h1>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {error && <p className={styles.error}>{error}</p>}

        {/* ── Basic Information ──────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Basic Information</legend>

          <Field label="School index" required>
            <input
              name="school_index"
              type="text"
              className={styles.input}
              value={fields.school_index}
              onChange={handleChange}
              required
              disabled={submitting}
              placeholder="e.g. 001"
            />
          </Field>

          <Field label="School name" required>
            <input
              name="school_name"
              type="text"
              className={styles.input}
              value={fields.school_name}
              onChange={handleChange}
              required
              disabled={submitting}
            />
          </Field>

          <Field label="School category">
            <input
              name="school_category"
              type="text"
              className={styles.input}
              value={fields.school_category}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Student admission type">
            <input
              name="student_admission_type"
              type="text"
              className={styles.input}
              value={fields.student_admission_type}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Medium of instruction">
            <input
              name="medium_of_instruction"
              type="text"
              className={styles.input}
              value={fields.medium_of_instruction}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="School type detail">
            <input
              name="school_type_detail"
              type="text"
              className={styles.input}
              value={fields.school_type_detail}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Year established">
            <input
              name="year_established"
              type="number"
              className={styles.input}
              value={fields.year_established}
              onChange={handleChange}
              disabled={submitting}
              placeholder="e.g. 1950"
              min="1800"
              max="2100"
            />
          </Field>

          <Field label="Census number">
            <input
              name="school_census_no"
              type="text"
              className={styles.input}
              value={fields.school_census_no}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="No. of students">
            <input
              name="no_of_students"
              type="number"
              className={styles.input}
              value={fields.no_of_students}
              onChange={handleChange}
              disabled={submitting}
              min="0"
            />
          </Field>

          <Field label="No. of teachers">
            <input
              name="no_of_teachers"
              type="number"
              className={styles.input}
              value={fields.no_of_teachers}
              onChange={handleChange}
              disabled={submitting}
              min="0"
            />
          </Field>

          <Field label="Pensionable teachers">
            <input
              name="no_of_pensionable_teachers"
              type="number"
              className={styles.input}
              value={fields.no_of_pensionable_teachers}
              onChange={handleChange}
              disabled={submitting}
              min="0"
            />
          </Field>
        </fieldset>

        {/* ── Location Information ───────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Location Information</legend>

          <Field label="Province">
            <input
              name="province"
              type="text"
              className={styles.input}
              value={fields.province}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="District">
            <input
              name="district"
              type="text"
              className={styles.input}
              value={fields.district}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Region">
            <input
              name="region"
              type="text"
              className={styles.input}
              value={fields.region}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Zone">
            <input
              name="zone"
              type="text"
              className={styles.input}
              value={fields.zone}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Education zone">
            <input
              name="education_zone"
              type="text"
              className={styles.input}
              value={fields.education_zone}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Divisional secretariat">
            <input
              name="divisional_secretariat"
              type="text"
              className={styles.input}
              value={fields.divisional_secretariat}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Parish">
            <input
              name="parish"
              type="text"
              className={styles.input}
              value={fields.parish}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Address">
            <textarea
              name="school_address"
              className={styles.input}
              value={fields.school_address}
              onChange={handleChange}
              disabled={submitting}
              rows={3}
              style={{ resize: "vertical" }}
            />
          </Field>
        </fieldset>

        {/* ── Contact Information ────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Contact Information</legend>

          <Field label="Phone">
            <input
              name="school_phone"
              type="tel"
              className={styles.input}
              value={fields.school_phone}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Fax">
            <input
              name="school_fax"
              type="tel"
              className={styles.input}
              value={fields.school_fax}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Email">
            <input
              name="school_email"
              type="email"
              className={styles.input}
              value={fields.school_email}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>
        </fieldset>

        {/* ── BOG Religion Breakdown ─────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>
            Board of Governors — Religion Breakdown (%)
          </legend>

          <Field
            label="Catholic %"
            hint="Percentage of BOG members who are Catholic."
          >
            <input
              name="bog_catholic_pct"
              type="number"
              className={styles.input}
              value={fields.bog_catholic_pct}
              onChange={handleChange}
              disabled={submitting}
              min="0"
              max="100"
              step="0.01"
            />
          </Field>

          <Field label="Other Christian %">
            <input
              name="bog_other_christian_pct"
              type="number"
              className={styles.input}
              value={fields.bog_other_christian_pct}
              onChange={handleChange}
              disabled={submitting}
              min="0"
              max="100"
              step="0.01"
            />
          </Field>

          <Field label="Buddhist %">
            <input
              name="bog_buddhist_pct"
              type="number"
              className={styles.input}
              value={fields.bog_buddhist_pct}
              onChange={handleChange}
              disabled={submitting}
              min="0"
              max="100"
              step="0.01"
            />
          </Field>

          <Field label="Hindu %">
            <input
              name="bog_hindu_pct"
              type="number"
              className={styles.input}
              value={fields.bog_hindu_pct}
              onChange={handleChange}
              disabled={submitting}
              min="0"
              max="100"
              step="0.01"
            />
          </Field>

          <Field label="Islam %">
            <input
              name="bog_islam_pct"
              type="number"
              className={styles.input}
              value={fields.bog_islam_pct}
              onChange={handleChange}
              disabled={submitting}
              min="0"
              max="100"
              step="0.01"
            />
          </Field>

          <Field label="Other religion %">
            <input
              name="bog_other_religion_pct"
              type="number"
              className={styles.input}
              value={fields.bog_other_religion_pct}
              onChange={handleChange}
              disabled={submitting}
              min="0"
              max="100"
              step="0.01"
            />
          </Field>
        </fieldset>

        {/* ── Overview of School Highlighting ───────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>
            Overview of School Highlighting
          </legend>

          <Field label="Vesting information">
            <textarea
              name="overview_general"
              className={styles.input}
              value={fields.overview_general}
              onChange={handleChange}
              disabled={submitting}
              rows={3}
              style={{ resize: "vertical" }}
            />
          </Field>

          <Field label="Arbitration info">
            <textarea
              name="overview_remarks"
              className={styles.input}
              value={fields.overview_remarks}
              onChange={handleChange}
              disabled={submitting}
              rows={3}
              style={{ resize: "vertical" }}
            />
          </Field>

          <Field label="Devesting info">
            <textarea
              name="overview_special_notes"
              className={styles.input}
              value={fields.overview_special_notes}
              onChange={handleChange}
              disabled={submitting}
              rows={3}
              style={{ resize: "vertical" }}
            />
          </Field>

          <Field label="Other remarks">
            <textarea
              name="overview_challenges"
              className={styles.input}
              value={fields.overview_challenges}
              onChange={handleChange}
              disabled={submitting}
              rows={3}
              style={{ resize: "vertical" }}
            />
          </Field>
        </fieldset>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() =>
              navigate(isEdit ? `/vested/schools/${id}` : "/vested/schools")
            }
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!canSubmit}
          >
            {submitting
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save Changes"
                : "Create School"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, required, hint, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      {children}
      {hint && <p className={styles.fieldHint}>{hint}</p>}
    </div>
  );
}
