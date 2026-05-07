import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchFather, createFather, updateFather } from '../../api/fathers';
import { fetchSchools } from '../../api/schools';
import styles from './TeacherFormPage.module.css';

// These are the exact strings stored in father_qualifications.qualification.
// They match the values written by the import script — do not rename them.
const EDUCATIONAL_QUALS  = ['BTh', 'BPh', 'Degree', 'Masters', 'M.Phil', 'PhD'];
const PROFESSIONAL_QUALS = ['COE', 'BEd', 'PGDE', 'MEd', 'Other Dip.'];

const EMPTY_FORM = {
  father_no:                       '',
  full_name:                       '',
  school_id:                       '',
  registration:                    '',
  ordination_date:                 '',
  first_appointment_date:          '',
  present_school_appointment_date: '',
  five_year_completion:            '',
  evaluation:                      '',
  qualifications:                  [],
};

function toDateInput(val) {
  if (!val) return '';
  return String(val).slice(0, 10);
}

export default function FatherFormPage() {
  const navigate = useNavigate();
  const { id }   = useParams();
  const isEdit   = Boolean(id);

  const [fields,         setFields]         = useState(EMPTY_FORM);
  const [schools,        setSchools]        = useState([]);
  const [loadingFather,  setLoadingFather]  = useState(isEdit);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState('');

  // ── Load private schools ───────────────────────────────────────────────────
  useEffect(() => {
    fetchSchools('Private')
      .then(setSchools)
      .catch(() => setError('Could not load schools list.'))
      .finally(() => setSchoolsLoading(false));
  }, []);

  // ── Load existing father for edit ──────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    setLoadingFather(true);
    fetchFather(id)
      .then((f) => {
        setFields({
          father_no:                       String(f.father_no ?? ''),
          full_name:                       f.full_name ?? '',
          school_id:                       String(f.school_id ?? ''),
          registration:                    f.registration ?? '',
          ordination_date:                 toDateInput(f.ordination_date),
          first_appointment_date:          toDateInput(f.first_appointment_date),
          present_school_appointment_date: toDateInput(f.present_school_appointment_date),
          five_year_completion:            toDateInput(f.five_year_completion),
          evaluation:                      f.evaluation ?? '',
          qualifications:                  f.qualifications ?? [],
        });
      })
      .catch((err) => setError(err.response?.data?.message ?? 'Failed to load father.'))
      .finally(() => setLoadingFather(false));
  }, [id, isEdit]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function handleChange(e) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  function toggleQual(qual) {
    setFields((prev) => ({
      ...prev,
      qualifications: prev.qualifications.includes(qual)
        ? prev.qualifications.filter((q) => q !== qual)
        : [...prev.qualifications, qual],
    }));
  }

  const canSubmit =
    !submitting &&
    !schoolsLoading &&
    fields.full_name.trim() !== '' &&
    fields.school_id !== '' &&
    (isEdit || fields.father_no.trim() !== '');

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!fields.full_name.trim())             { setError('Full name is required.'); return; }
    if (!fields.school_id)                    { setError('School is required.'); return; }
    if (!isEdit && !fields.father_no.trim())  { setError('Father No. is required.'); return; }

    setError('');
    setSubmitting(true);
    try {
      // qualifications is the same flat string[] for both create and update.
      // The service calls replaceQualifications, so sending [] clears all.
      const qualPayload = fields.qualifications;

      if (isEdit) {
        await updateFather(id, {
          full_name:                       fields.full_name.trim(),
          school_id:                       Number(fields.school_id),
          registration:                    fields.registration.trim() || null,
          ordination_date:                 fields.ordination_date || null,
          first_appointment_date:          fields.first_appointment_date || null,
          present_school_appointment_date: fields.present_school_appointment_date || null,
          five_year_completion:            fields.five_year_completion || null,
          evaluation:                      fields.evaluation.trim() || null,
          qualifications:                  qualPayload,
        });
        navigate(`/private/fathers/${id}`);
      } else {
        await createFather({
          father_no:                       Number(fields.father_no),
          full_name:                       fields.full_name.trim(),
          school_id:                       Number(fields.school_id),
          registration:                    fields.registration.trim() || null,
          ordination_date:                 fields.ordination_date || null,
          first_appointment_date:          fields.first_appointment_date || null,
          present_school_appointment_date: fields.present_school_appointment_date || null,
          five_year_completion:            fields.five_year_completion || null,
          evaluation:                      fields.evaluation.trim() || null,
          qualifications:                  qualPayload,
        });
        navigate('/private/fathers');
      }
    } catch (err) {
      setError(err.response?.data?.message ?? `Failed to ${isEdit ? 'update' : 'create'} father.`);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loadingFather) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingMsg}>Loading father…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        {isEdit ? 'Edit Father' : 'Add Father'}
      </h1>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {error && <p className={styles.error}>{error}</p>}

        {/* ── Identity ──────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Identity</legend>

          <Field label="Father No." required={!isEdit}>
            <input
              name="father_no"
              type="number"
              min="1"
              className={styles.input}
              value={fields.father_no}
              onChange={handleChange}
              disabled={submitting || isEdit}
              placeholder="e.g. 42"
            />
          </Field>

          <Field label="Full name" required>
            <input
              name="full_name"
              type="text"
              className={styles.input}
              value={fields.full_name}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Registration">
            <input
              name="registration"
              type="text"
              className={styles.input}
              value={fields.registration}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>
        </fieldset>

        {/* ── School ────────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>School</legend>

          <Field label="School" required>
            <select
              name="school_id"
              className={styles.select}
              value={fields.school_id}
              onChange={handleChange}
              disabled={submitting || schoolsLoading}
            >
              <option value="">
                {schoolsLoading ? 'Loading schools…' : 'Select a school…'}
              </option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.school_index} – {s.school_name}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>

        {/* ── Dates ─────────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Dates</legend>

          <Field label="Ordination date">
            <input
              name="ordination_date"
              type="date"
              className={styles.input}
              value={fields.ordination_date}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="First appointment date">
            <input
              name="first_appointment_date"
              type="date"
              className={styles.input}
              value={fields.first_appointment_date}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Present school appointment date">
            <input
              name="present_school_appointment_date"
              type="date"
              className={styles.input}
              value={fields.present_school_appointment_date}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Five-year completion date">
            <input
              name="five_year_completion"
              type="date"
              className={styles.input}
              value={fields.five_year_completion}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>
        </fieldset>

        {/* ── Qualifications ────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Qualifications</legend>

          <div className={styles.field}>
            <span className={styles.label}>Educational</span>
            <div className={styles.checkGroup}>
              {EDUCATIONAL_QUALS.map((q) => (
                <label key={q} className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={fields.qualifications.includes(q)}
                    onChange={() => toggleQual(q)}
                    disabled={submitting}
                  />
                  {q}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Professional</span>
            <div className={styles.checkGroup}>
              {PROFESSIONAL_QUALS.map((q) => (
                <label key={q} className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={fields.qualifications.includes(q)}
                    onChange={() => toggleQual(q)}
                    disabled={submitting}
                  />
                  {q}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        {/* ── Other ─────────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Other</legend>

          <Field label="Evaluation">
            <input
              name="evaluation"
              type="text"
              className={styles.input}
              value={fields.evaluation}
              onChange={handleChange}
              disabled={submitting}
              placeholder="e.g. Yes"
            />
          </Field>
        </fieldset>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() =>
              navigate(isEdit ? `/private/fathers/${id}` : '/private/fathers')
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
              ? (isEdit ? 'Saving…' : 'Creating…')
              : (isEdit ? 'Save Changes' : 'Add Father')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      {children}
    </div>
  );
}
