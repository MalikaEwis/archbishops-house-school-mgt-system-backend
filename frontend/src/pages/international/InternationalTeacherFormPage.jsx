import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { fetchSchools } from '../../api/schools';
import { fetchInternationalTeacher, createInternationalTeacher, updateInternationalTeacher } from '../../api/internationalTeachers';
import styles from '../private/TeacherFormPage.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIN_CATEGORY_OPTIONS = [
  { value: '1', label: '1 – Teacher' },
  { value: '2', label: '2 – Clerical Staff' },
  { value: '3', label: '3 – Minor Staff' },
];

// International teachers have only two employment categories (FR-39)
const CATEGORY_OPTIONS = [
  { value: 'Permanent',           label: 'Permanent' },
  { value: 'Fixed_Term_Contract', label: 'Fixed Term Contract' },
];

const EDUCATION_OPTIONS = ['A/L', 'Graduate', 'MA', 'PhD'];

// ── Empty form state ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  // Identity
  full_name:   '',
  designation: '',
  nic:         '',
  date_of_birth: '',
  religion:    '',
  address:     '',
  email:       '',
  // TIN / Assignment (immutable after create)
  tin_category: '1',
  school_id:    '',
  // Employment
  category:                  'Permanent',
  date_of_first_appointment: '',
  // Qualifications
  mediums:                     [],
  class_levels:                [],
  education:                   [],
  professional_qualifications: [],
  subjects:                    [],
  // Phones
  phones: [{ phone_number: '', phone_type: 'Mobile', is_primary: true }],
  // Contract — Permanent
  probation_start: '',
  probation_end:   '',
  // Contract — Fixed Term Contract
  contract_start:  '',
  contract_end:    '',
  contract_expiry: '',
};

function toDateInput(val) {
  if (!val) return '';
  return String(val).slice(0, 10);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InternationalTeacherFormPage() {
  const navigate = useNavigate();
  const { id }   = useParams();
  const isEdit   = Boolean(id);

  const [fields,         setFields]         = useState(EMPTY_FORM);
  const [schools,        setSchools]        = useState([]);
  const [loadingTeacher, setLoadingTeacher] = useState(isEdit);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState('');

  // TIN preview (create only)
  const [tinPreview,        setTinPreview]        = useState(null);
  const [tinPreviewLoading, setTinPreviewLoading] = useState(false);
  const [tinActual,         setTinActual]         = useState('');
  const tinAbortRef = useRef(null);

  // Tag-input state
  const [subjectInput, setSubjectInput] = useState('');
  const [qualInput,    setQualInput]    = useState('');

  // ── Load International schools ────────────────────────────────────────────
  useEffect(() => {
    fetchSchools('International')
      .then(setSchools)
      .catch(() => setError('Could not load schools list.'))
      .finally(() => setSchoolsLoading(false));
  }, []);

  // ── Load teacher for edit mode ────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    setLoadingTeacher(true);
    fetchInternationalTeacher(id)
      .then((t) => {
        setTinActual(t.tin ?? '');
        setFields({
          full_name:   t.full_name   ?? '',
          designation: t.designation ?? '',
          nic:         t.nic         ?? '',
          date_of_birth: toDateInput(t.date_of_birth),
          religion:    t.religion    ?? '',
          address:     t.address     ?? '',
          email:       t.email       ?? '',
          tin_category: String(t.tin_category ?? '1'),
          school_id:    String(t.school_id    ?? ''),
          category:                  t.category                  ?? 'Permanent',
          date_of_first_appointment: toDateInput(t.date_of_first_appointment),
          mediums:      t.mediums      ?? [],
          class_levels: t.class_levels ?? [],
          education:    (t.education ?? []).map((e) => e.qualification),
          professional_qualifications: (t.professional_qualifications ?? []).map((q) => q.qualification),
          subjects:     t.subjects     ?? [],
          phones: t.phones?.length
            ? t.phones.map((p) => ({
                phone_number: p.phone_number ?? '',
                phone_type:   p.phone_type   ?? 'Mobile',
                is_primary:   Boolean(p.is_primary),
              }))
            : [{ phone_number: '', phone_type: 'Mobile', is_primary: true }],
          probation_start: toDateInput(t.contract?.probation_start),
          probation_end:   toDateInput(t.contract?.probation_end),
          contract_start:  toDateInput(t.contract?.contract_start),
          contract_end:    toDateInput(t.contract?.contract_end),
          contract_expiry: toDateInput(t.contract?.contract_expiry),
        });
      })
      .catch((err) => setError(err.response?.data?.message ?? 'Failed to load teacher.'))
      .finally(() => setLoadingTeacher(false));
  }, [id, isEdit]);

  // ── TIN preview (create only) ─────────────────────────────────────────────
  useEffect(() => {
    if (isEdit) return;

    const school = schools.find((s) => String(s.id) === String(fields.school_id));
    if (!fields.tin_category || !school) {
      setTinPreview(null);
      return;
    }

    if (tinAbortRef.current) tinAbortRef.current.abort();
    const controller = new AbortController();
    tinAbortRef.current = controller;

    setTinPreviewLoading(true);
    setTinPreview(null);

    client.get('/tin/preview', {
      params: {
        tableType:    'International',
        category:     fields.tin_category,
        schoolNumber: parseInt(school.school_index, 10),
      },
      signal: controller.signal,
    })
      .then(({ data }) => setTinPreview(data.data))
      .catch((err) => { if (err.name !== 'CanceledError') setTinPreview(null); })
      .finally(() => { if (!controller.signal.aborted) setTinPreviewLoading(false); });
  }, [fields.tin_category, fields.school_id, schools, isEdit]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setFields((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function toggleCheck(field, value) {
    setFields((prev) => {
      const arr = prev[field];
      return {
        ...prev,
        [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  }

  function addTag(field, rawValue, clearInput) {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    setFields((prev) => {
      if (prev[field].includes(trimmed)) return prev;
      return { ...prev, [field]: [...prev[field], trimmed] };
    });
    clearInput('');
  }

  function removeTag(field, value) {
    setFields((prev) => ({ ...prev, [field]: prev[field].filter((v) => v !== value) }));
  }

  function handleTagKey(e, field, inputValue, clearInput) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(field, inputValue, clearInput);
    }
  }

  // Phone helpers
  function addPhone() {
    setFields((prev) => ({
      ...prev,
      phones: [...prev.phones, { phone_number: '', phone_type: 'Mobile', is_primary: false }],
    }));
  }

  function removePhone(index) {
    setFields((prev) => {
      const phones = prev.phones.filter((_, i) => i !== index);
      if (phones.length > 0 && !phones.some((p) => p.is_primary)) {
        phones[0] = { ...phones[0], is_primary: true };
      }
      return { ...prev, phones };
    });
  }

  function updatePhone(index, field, value) {
    setFields((prev) => ({
      ...prev,
      phones: prev.phones.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  }

  function setPrimary(index) {
    setFields((prev) => ({
      ...prev,
      phones: prev.phones.map((p, i) => ({ ...p, is_primary: i === index })),
    }));
  }

  function selectedSchool() {
    return schools.find((s) => String(s.id) === String(fields.school_id));
  }

  function buildContractPayload() {
    if (fields.category === 'Permanent') {
      return {
        probation_start: fields.probation_start || null,
        probation_end:   fields.probation_end   || null,
        contract_start:  null,
        contract_end:    null,
        contract_expiry: null,
      };
    }
    return {
      probation_start: null,
      probation_end:   null,
      contract_start:  fields.contract_start  || null,
      contract_end:    fields.contract_end    || null,
      contract_expiry: fields.contract_expiry || null,
    };
  }

  const canSubmit =
    !submitting &&
    !schoolsLoading &&
    fields.full_name.trim() !== '' &&
    fields.nic.trim() !== '' &&
    fields.date_of_birth !== '' &&
    fields.school_id !== '';

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const school = selectedSchool();
    if (!isEdit && !school) { setError('Please select a school.'); return; }

    setSubmitting(true);
    try {
      if (isEdit) {
        const body = {
          full_name:   fields.full_name.trim(),
          designation: fields.designation.trim() || null,
          nic:         fields.nic.trim(),
          date_of_birth: fields.date_of_birth,
          religion:    fields.religion.trim() || null,
          address:     fields.address.trim()  || null,
          email:       fields.email.trim()    || null,
          category:    fields.category,
          date_of_first_appointment: fields.date_of_first_appointment || null,
          mediums:      fields.mediums,
          class_levels: fields.class_levels,
          education:    fields.education.map((q) => ({ qualification: q, other_detail: null })),
          professional_qualifications: fields.professional_qualifications,
          subjects:     fields.subjects,
          phones:       fields.phones.filter((p) => p.phone_number.trim()),
          contract:     buildContractPayload(),
        };
        await updateInternationalTeacher(id, body);
        navigate(`/international/teachers/${id}`);
      } else {
        const body = {
          full_name:   fields.full_name.trim(),
          designation: fields.designation.trim() || null,
          nic:         fields.nic.trim(),
          date_of_birth: fields.date_of_birth,
          religion:    fields.religion.trim() || null,
          address:     fields.address.trim()  || null,
          email:       fields.email.trim()    || null,
          category:    fields.category,
          tin_category:      Number(fields.tin_category),
          tin_school_number: parseInt(school.school_index, 10),
          school_id:         Number(fields.school_id),
          date_of_first_appointment: fields.date_of_first_appointment || null,
          mediums:      fields.mediums,
          class_levels: fields.class_levels,
          education:    fields.education.map((q) => ({ qualification: q, other_detail: null })),
          professional_qualifications: fields.professional_qualifications,
          subjects:     fields.subjects,
          phones:       fields.phones.filter((p) => p.phone_number.trim()),
          contract:     buildContractPayload(),
        };
        await createInternationalTeacher(body);
        navigate('/international/teachers');
      }
    } catch (err) {
      setError(err.response?.data?.message ?? `Failed to ${isEdit ? 'update' : 'create'} teacher.`);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loadingTeacher) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingMsg}>Loading teacher…</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        {isEdit ? 'Edit Teacher' : 'Create Teacher'}
      </h1>

      {/* ── TIN banner ────────────────────────────────────────────────────── */}
      {isEdit ? (
        <div className={styles.tinBanner}>
          <span className={styles.tinLabel}>TIN</span>
          <span className={styles.tinValue}>{tinActual || '—'}</span>
        </div>
      ) : (
        <div className={styles.tinBanner}>
          <span className={styles.tinLabel}>TIN preview</span>
          {tinPreviewLoading ? (
            <span className={styles.tinMuted}>Calculating…</span>
          ) : tinPreview ? (
            <>
              <span className={styles.tinValue}>{tinPreview.previewTin}</span>
              {tinPreview.isReuse && (
                <span className={styles.tinReuse}>reusing vacated slot</span>
              )}
            </>
          ) : (
            <span className={styles.tinMuted}>
              {fields.tin_category && fields.school_id
                ? 'Could not load preview'
                : 'Select TIN category and school to preview'}
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {error && <p className={styles.error}>{error}</p>}

        {/* ── TIN / School ──────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>TIN &amp; School</legend>

          <Field
            label="TIN category"
            required
            hint="Used in the TIN number. 1 = Teacher, 2 = Clerical, 3 = Minor Staff."
          >
            <select
              name="tin_category"
              className={styles.select}
              value={fields.tin_category}
              onChange={handleChange}
              disabled={submitting || isEdit}
            >
              {TIN_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="School" required>
            <select
              name="school_id"
              className={styles.select}
              value={fields.school_id}
              onChange={handleChange}
              disabled={submitting || schoolsLoading || isEdit}
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

        {/* ── Identity ──────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Identity</legend>

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

          <Field label="Designation">
            <input
              name="designation"
              type="text"
              className={styles.input}
              value={fields.designation}
              onChange={handleChange}
              disabled={submitting}
              placeholder="e.g. Head of Mathematics"
            />
          </Field>

          <Field label="NIC" required>
            <input
              name="nic"
              type="text"
              className={styles.input}
              value={fields.nic}
              onChange={handleChange}
              disabled={submitting}
              placeholder="e.g. 901234567V or 199012345678"
            />
          </Field>

          <Field label="Date of birth" required>
            <input
              name="date_of_birth"
              type="date"
              className={styles.input}
              value={fields.date_of_birth}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Religion">
            <input
              name="religion"
              type="text"
              className={styles.input}
              value={fields.religion}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Email">
            <input
              name="email"
              type="email"
              className={styles.input}
              value={fields.email}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Address">
            <input
              name="address"
              type="text"
              className={styles.input}
              value={fields.address}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>
        </fieldset>

        {/* ── Employment ────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Employment</legend>

          <Field label="Category" required hint="Permanent staff have a 6-month probation period.">
            <select
              name="category"
              className={styles.select}
              value={fields.category}
              onChange={handleChange}
              disabled={submitting}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Date of first appointment">
            <input
              name="date_of_first_appointment"
              type="date"
              className={styles.input}
              value={fields.date_of_first_appointment}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

        </fieldset>

        {/* ── Contract ──────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Contract</legend>

          {fields.category === 'Permanent' ? (
            <>
              <Field label="Probation start date">
                <input
                  name="probation_start"
                  type="date"
                  className={styles.input}
                  value={fields.probation_start}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Field>
              <Field label="Probation end date">
                <input
                  name="probation_end"
                  type="date"
                  className={styles.input}
                  value={fields.probation_end}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Contract start date">
                <input
                  name="contract_start"
                  type="date"
                  className={styles.input}
                  value={fields.contract_start}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Field>
              <Field label="Contract end date">
                <input
                  name="contract_end"
                  type="date"
                  className={styles.input}
                  value={fields.contract_end}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Field>
              <Field label="Contract expiry date">
                <input
                  name="contract_expiry"
                  type="date"
                  className={styles.input}
                  value={fields.contract_expiry}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Field>
            </>
          )}
        </fieldset>

        {/* ── Qualifications & Teaching ──────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Qualifications &amp; Teaching</legend>

          {/* Mediums */}
          <div className={styles.field}>
            <span className={styles.label}>Mediums</span>
            <div className={styles.checkGroup}>
              {['English', 'Tamil', 'Sinhala'].map((m) => (
                <label key={m} className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={fields.mediums.includes(m)}
                    onChange={() => toggleCheck('mediums', m)}
                    disabled={submitting}
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>

          {/* Class Levels */}
          <div className={styles.field}>
            <span className={styles.label}>Class Levels</span>
            <div className={styles.checkGroup}>
              {['1-5', '6-11', '12-13'].map((cl) => (
                <label key={cl} className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={fields.class_levels.includes(cl)}
                    onChange={() => toggleCheck('class_levels', cl)}
                    disabled={submitting}
                  />
                  {cl}
                </label>
              ))}
            </div>
          </div>

          {/* Education */}
          <div className={styles.field}>
            <span className={styles.label}>Education</span>
            <div className={styles.checkGroup}>
              {EDUCATION_OPTIONS.map((eq) => (
                <label key={eq} className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={fields.education.includes(eq)}
                    onChange={() => toggleCheck('education', eq)}
                    disabled={submitting}
                  />
                  {eq}
                </label>
              ))}
            </div>
          </div>

          {/* Professional Qualifications — tag input */}
          <div className={styles.field}>
            <span className={styles.label}>Professional Qualifications</span>
            <div className={styles.tagInputWrap}>
              {fields.professional_qualifications.map((q) => (
                <span key={q} className={styles.tag}>
                  {q}
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => removeTag('professional_qualifications', q)}
                    disabled={submitting}
                  >×</button>
                </span>
              ))}
              <input
                type="text"
                className={styles.tagInput}
                placeholder="Type and press Enter or comma…"
                value={qualInput}
                onChange={(e) => setQualInput(e.target.value)}
                onKeyDown={(e) => handleTagKey(e, 'professional_qualifications', qualInput, setQualInput)}
                onBlur={() => addTag('professional_qualifications', qualInput, setQualInput)}
                disabled={submitting}
              />
            </div>
            <p className={styles.fieldHint}>e.g. PGDE, B.Ed, Dip.Ed</p>
          </div>

          {/* Subjects — tag input */}
          <div className={styles.field}>
            <span className={styles.label}>Subjects</span>
            <div className={styles.tagInputWrap}>
              {fields.subjects.map((s) => (
                <span key={s} className={styles.tag}>
                  {s}
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => removeTag('subjects', s)}
                    disabled={submitting}
                  >×</button>
                </span>
              ))}
              <input
                type="text"
                className={styles.tagInput}
                placeholder="Type and press Enter or comma…"
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                onKeyDown={(e) => handleTagKey(e, 'subjects', subjectInput, setSubjectInput)}
                onBlur={() => addTag('subjects', subjectInput, setSubjectInput)}
                disabled={submitting}
              />
            </div>
            <p className={styles.fieldHint}>e.g. Mathematics, Science</p>
          </div>
        </fieldset>

        {/* ── Contact Information ───────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Contact Information</legend>

          <div className={styles.phoneList}>
            {fields.phones.map((phone, idx) => (
              <div key={idx} className={styles.phoneRow}>
                <input
                  type="tel"
                  className={styles.input}
                  placeholder="Phone number"
                  value={phone.phone_number}
                  onChange={(e) => updatePhone(idx, 'phone_number', e.target.value)}
                  disabled={submitting}
                />
                <select
                  className={styles.select}
                  value={phone.phone_type}
                  onChange={(e) => updatePhone(idx, 'phone_type', e.target.value)}
                  disabled={submitting}
                >
                  {['Mobile', 'Home', 'Work'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <label className={styles.primaryLabel}>
                  <input
                    type="radio"
                    name="phone_primary"
                    checked={phone.is_primary}
                    onChange={() => setPrimary(idx)}
                    disabled={submitting}
                  />
                  Primary
                </label>
                {fields.phones.length > 1 && (
                  <button
                    type="button"
                    className={styles.phoneRemoveBtn}
                    onClick={() => removePhone(idx)}
                    disabled={submitting}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            className={styles.addPhoneBtn}
            onClick={addPhone}
            disabled={submitting}
          >
            + Add Phone Number
          </button>
        </fieldset>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() =>
              navigate(isEdit ? `/international/teachers/${id}` : '/international/teachers')
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
              ? isEdit ? 'Saving…' : 'Creating…'
              : isEdit ? 'Save Changes' : 'Create Teacher'}
          </button>
        </div>
      </form>
    </div>
  );
}

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
