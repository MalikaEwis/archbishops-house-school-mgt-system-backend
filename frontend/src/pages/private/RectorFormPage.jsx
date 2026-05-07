import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchRector, createRector, updateRector } from '../../api/rectors';
import { fetchSchools } from '../../api/schools';
import styles from './TeacherFormPage.module.css';

const REGISTRATION_STATUS_OPTIONS = [
  { value: 'Registered',   label: 'Registered' },
  { value: 'Unregistered', label: 'Unregistered' },
  { value: 'Pending',      label: 'Pending' },
];

// These are the exact strings stored in rector_qualifications.qualification.
// Rectors have LTh in addition to the shared set — do not rename them.
const EDUCATIONAL_QUALS  = ['BTh', 'BPh', 'LTh', 'Degree', 'Masters', 'M.Phil', 'PhD'];
const PROFESSIONAL_QUALS = ['COE', 'BEd', 'PGDE', 'MEd', 'Other Dip.'];

const EMPTY_FORM = {
  rector_no:                     '',
  full_name:                     '',
  present_school_id:             '',
  registration_status:           'Pending',
  date_of_birth:                 '',
  first_appointment_date:        '',
  appointment_to_present_school: '',
  retirement_date:               '',
  qualifications:                [],
};

function toDateInput(val) {
  if (!val) return '';
  return String(val).slice(0, 10);
}

export default function RectorFormPage() {
  const navigate = useNavigate();
  const { id }   = useParams();
  const isEdit   = Boolean(id);

  const [fields,         setFields]         = useState(EMPTY_FORM);
  const [schools,        setSchools]        = useState([]);
  const [loadingRector,  setLoadingRector]  = useState(isEdit);
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

  // ── Load existing rector for edit ──────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    setLoadingRector(true);
    fetchRector(id)
      .then((r) => {
        setFields({
          rector_no:                     String(r.rector_no ?? ''),
          full_name:                     r.full_name ?? '',
          present_school_id:             String(r.present_school_id ?? ''),
          registration_status:           r.registration_status ?? 'Pending',
          date_of_birth:                 toDateInput(r.date_of_birth),
          first_appointment_date:        toDateInput(r.first_appointment_date),
          appointment_to_present_school: toDateInput(r.appointment_to_present_school),
          retirement_date:               toDateInput(r.retirement_date),
          qualifications:                r.qualifications ?? [],
        });
      })
      .catch((err) => setError(err.response?.data?.message ?? 'Failed to load rector.'))
      .finally(() => setLoadingRector(false));
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
    fields.present_school_id !== '' &&
    (isEdit || fields.rector_no.trim() !== '');

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!fields.full_name.trim())            { setError('Full name is required.'); return; }
    if (!fields.present_school_id)           { setError('School is required.'); return; }
    if (!isEdit && !fields.rector_no.trim()) { setError('Rector No. is required.'); return; }

    setError('');
    setSubmitting(true);
    try {
      // qualifications is the same flat string[] for both create and update.
      // The service calls replaceQualifications, so sending [] clears all.
      const qualPayload = fields.qualifications;

      if (isEdit) {
        await updateRector(id, {
          full_name:                     fields.full_name.trim(),
          present_school_id:             Number(fields.present_school_id),
          registration_status:           fields.registration_status,
          date_of_birth:                 fields.date_of_birth || null,
          first_appointment_date:        fields.first_appointment_date || null,
          appointment_to_present_school: fields.appointment_to_present_school || null,
          retirement_date:               fields.retirement_date || null,
          qualifications:                qualPayload,
        });
        navigate(`/private/rectors/${id}`);
      } else {
        await createRector({
          rector_no:                     Number(fields.rector_no),
          full_name:                     fields.full_name.trim(),
          present_school_id:             Number(fields.present_school_id),
          registration_status:           fields.registration_status,
          date_of_birth:                 fields.date_of_birth || null,
          first_appointment_date:        fields.first_appointment_date || null,
          appointment_to_present_school: fields.appointment_to_present_school || null,
          retirement_date:               fields.retirement_date || null,
          qualifications:                qualPayload,
        });
        navigate('/private/rectors');
      }
    } catch (err) {
      setError(err.response?.data?.message ?? `Failed to ${isEdit ? 'update' : 'create'} rector.`);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loadingRector) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingMsg}>Loading rector…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        {isEdit ? 'Edit Rector' : 'Add Rector'}
      </h1>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {error && <p className={styles.error}>{error}</p>}

        {/* ── Identity ──────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Identity</legend>

          <Field label="Rector No." required={!isEdit}>
            <input
              name="rector_no"
              type="number"
              min="1"
              className={styles.input}
              value={fields.rector_no}
              onChange={handleChange}
              disabled={submitting || isEdit}
              placeholder="e.g. 12"
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

          <Field label="Registration status">
            <select
              name="registration_status"
              className={styles.select}
              value={fields.registration_status}
              onChange={handleChange}
              disabled={submitting}
            >
              {REGISTRATION_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </fieldset>

        {/* ── School ────────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>School</legend>

          <Field label="School" required>
            <select
              name="present_school_id"
              className={styles.select}
              value={fields.present_school_id}
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

          <Field label="Date of birth">
            <input
              name="date_of_birth"
              type="date"
              className={styles.input}
              value={fields.date_of_birth}
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

          <Field label="Appointment to present school">
            <input
              name="appointment_to_present_school"
              type="date"
              className={styles.input}
              value={fields.appointment_to_present_school}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Retirement date">
            <input
              name="retirement_date"
              type="date"
              className={styles.input}
              value={fields.retirement_date}
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

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() =>
              navigate(isEdit ? `/private/rectors/${id}` : '/private/rectors')
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
              : (isEdit ? 'Save Changes' : 'Add Rector')}
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
