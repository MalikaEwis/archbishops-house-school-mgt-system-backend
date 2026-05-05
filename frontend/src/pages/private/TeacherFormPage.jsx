import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { fetchSchools } from '../../api/schools';
import { fetchTeacher } from '../../api/teachers';
import styles from './TeacherFormPage.module.css';

const TIN_CATEGORY_OPTIONS = [
  { value: '1', label: '1 – Teacher' },
  { value: '2', label: '2 – Clerical Staff' },
  { value: '3', label: '3 – Minor Staff' },
];

const PRESENT_CATEGORY_OPTIONS = [
  { value: '2', label: 'Cat 2 – Unregistered Permanent' },
  { value: '3', label: 'Cat 3 – Unregistered Training' },
  { value: '4', label: 'Cat 4 – Fixed Term' },
];

const GENDER_OPTIONS = [
  { value: 'Male',   label: 'Male' },
  { value: 'Female', label: 'Female' },
];

const SSP_OPTIONS = [
  { value: 'Not_Completed', label: 'Not Completed' },
  { value: 'Yes',           label: 'Yes' },
  { value: 'Completed',     label: 'Completed' },
];

// DB stores 'Yes' for "Following" — mapped at submit time.
const DCETT_OPTIONS = [
  { value: 'Not_Completed', label: 'Not Completed' },
  { value: 'Yes',           label: 'Following' },
  { value: 'Completed',     label: 'Completed' },
];

// '' in form state → null sent to backend ("Not Participated").
const ATTEMPT_OPTIONS = [
  { value: '',     label: 'Not Participated' },
  { value: 'Pass', label: 'Pass' },
  { value: 'Fail', label: 'Fail' },
];

const EMPTY_FORM = {
  full_name:               '',
  nic:                     '',
  gender:                  '',
  date_of_birth:           '',
  present_category:        '3',
  tin_category:            '1',
  school_id:               '',
  ssp_status:              'Not_Completed',
  dcett_status:            'Not_Completed',
  selection_test_attempt1: '',
  selection_test_attempt2: '',
  selection_test_attempt3: '',
  mediums:                      [],
  class_levels:                 [],
  education:                    [],
  professional_qualifications:  [],
  subjects:                     [],
  // Phones — start with one blank entry
  phones: [{ phone_number: '', phone_type: 'Mobile', is_primary: true }],
  // Contract dates (flattened; reconstructed into object on submit)
  contract_6month_start: '',
  contract_6month_end:   '',
  contract_2nd_end:      '',
  contract_3rd_end:      '',
};

// ISO datetime → yyyy-mm-dd for <input type="date">
function toDateInputValue(val) {
  if (!val) return '';
  return String(val).slice(0, 10);
}

export default function TeacherFormPage() {
  const navigate    = useNavigate();
  const { id }      = useParams();
  const isEdit      = Boolean(id);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [fields,  setFields]  = useState(EMPTY_FORM);
  const [schools, setSchools] = useState([]);

  // ── Async state ────────────────────────────────────────────────────────────
  const [loadingTeacher, setLoadingTeacher] = useState(isEdit);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState('');

  // ── TIN preview (create mode only) ────────────────────────────────────────
  const [tinPreview,        setTinPreview]        = useState(null); // { previewTin, isReuse }
  const [tinPreviewLoading, setTinPreviewLoading] = useState(false);
  const [tinActual,         setTinActual]         = useState('');   // edit mode: real TIN

  // Abort controller ref so we can cancel stale preview requests
  const tinAbortRef = useRef(null);

  // ── Tag-input local state (subjects & professional qualifications) ──────────
  const [subjectInput, setSubjectInput] = useState('');
  const [qualInput,    setQualInput]    = useState('');

  // ── Load schools ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSchools('Private')
      .then(setSchools)
      .catch(() => setError('Could not load schools list.'))
      .finally(() => setSchoolsLoading(false));
  }, []);

  // ── Load teacher for edit mode ─────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    setLoadingTeacher(true);
    fetchTeacher(id)
      .then((t) => {
        setTinActual(t.tin);
        setFields({
          full_name:               t.full_name ?? '',
          nic:                     t.nic       ?? '',
          gender:                  t.gender    ?? '',
          date_of_birth:           toDateInputValue(t.date_of_birth),
          present_category:        String(t.present_category ?? '3'),
          tin_category:            String(t.tin_category     ?? '1'),
          school_id:               String(t.school_id        ?? ''),
          ssp_status:              t.ssp_status              ?? 'Not_Completed',
          dcett_status:            t.dcett_status            ?? 'Not_Completed',
          selection_test_attempt1: t.selection_test_attempt1 ?? '',
          selection_test_attempt2: t.selection_test_attempt2 ?? '',
          selection_test_attempt3: t.selection_test_attempt3 ?? '',
          // Satellite arrays — flatten objects returned by the API into plain values
          mediums:                     t.mediums      ?? [],
          class_levels:                t.class_levels ?? [],
          education:                   (t.education                   ?? []).map((e) => e.qualification),
          professional_qualifications: (t.professional_qualifications ?? []).map((q) => q.qualification),
          subjects:                    t.subjects     ?? [],
          // Phones
          phones: t.phones?.length
            ? t.phones.map((p) => ({
                phone_number: p.phone_number ?? '',
                phone_type:   p.phone_type   ?? 'Mobile',
                is_primary:   Boolean(p.is_primary),
              }))
            : [{ phone_number: '', phone_type: 'Mobile', is_primary: true }],
          // Contract dates (flatten from nested object)
          contract_6month_start: toDateInputValue(t.contract?.contract_6month_start),
          contract_6month_end:   toDateInputValue(t.contract?.contract_6month_end),
          contract_2nd_end:      toDateInputValue(t.contract?.contract_2nd_end),
          contract_3rd_end:      toDateInputValue(t.contract?.contract_3rd_end),
        });
      })
      .catch((err) => setError(err.response?.data?.message ?? 'Failed to load teacher.'))
      .finally(() => setLoadingTeacher(false));
  }, [id, isEdit]);

  // ── TIN preview (fires when tin_category or school_id changes, create only) ──
  useEffect(() => {
    if (isEdit) return;

    const school = schools.find((s) => String(s.id) === String(fields.school_id));
    if (!fields.tin_category || !school) {
      setTinPreview(null);
      return;
    }

    // Cancel any in-flight request
    if (tinAbortRef.current) tinAbortRef.current.abort();
    const controller = new AbortController();
    tinAbortRef.current = controller;

    setTinPreviewLoading(true);
    setTinPreview(null);

    client.get('/tin/preview', {
      params: {
        tableType:    'Private',
        category:     fields.tin_category,
        schoolNumber: parseInt(school.school_index, 10),
      },
      signal: controller.signal,
    })
      .then(({ data }) => setTinPreview(data.data))
      .catch((err) => { if (err.name !== 'CanceledError') setTinPreview(null); })
      .finally(() => {
        if (!controller.signal.aborted) setTinPreviewLoading(false);
      });
  }, [fields.tin_category, fields.school_id, schools, isEdit]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function handleChange(e) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  function handleAttemptChange(field, value) {
    setFields((prev) => {
      const next = { ...prev, [field]: value };
      // Clear downstream attempts when a parent is cleared
      if (field === 'selection_test_attempt1' && !value) {
        next.selection_test_attempt2 = '';
        next.selection_test_attempt3 = '';
      }
      if (field === 'selection_test_attempt2' && !value) {
        next.selection_test_attempt3 = '';
      }
      return next;
    });
  }

  // Toggle a value in/out of a checkbox-backed array field
  function toggleCheck(field, value) {
    setFields((prev) => {
      const arr = prev[field];
      return {
        ...prev,
        [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  }

  // Add a tag to a free-text array field (ignores blank / duplicates)
  function addTag(field, rawValue, clearInput) {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    setFields((prev) => {
      if (prev[field].includes(trimmed)) return prev;
      return { ...prev, [field]: [...prev[field], trimmed] };
    });
    clearInput('');
  }

  // Remove a tag by value
  function removeTag(field, value) {
    setFields((prev) => ({ ...prev, [field]: prev[field].filter((v) => v !== value) }));
  }

  // Commit a tag on Enter or comma keydown
  function handleTagKey(e, field, inputValue, clearInput) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(field, inputValue, clearInput);
    }
  }

  // ── Phone helpers ──────────────────────────────────────────────────────────
  function addPhone() {
    setFields((prev) => ({
      ...prev,
      phones: [...prev.phones, { phone_number: '', phone_type: 'Mobile', is_primary: false }],
    }));
  }

  function removePhone(index) {
    setFields((prev) => {
      const phones = prev.phones.filter((_, i) => i !== index);
      // If the removed entry was primary, promote the first remaining entry
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

  const canSubmit =
    !submitting &&
    !schoolsLoading &&
    fields.full_name.trim() &&
    fields.gender &&
    fields.date_of_birth &&
    fields.school_id;

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const school = selectedSchool();
    if (!isEdit && !school) { setError('Please select a school.'); return; }

    setSubmitting(true);
    try {
      if (isEdit) {
        // PATCH — only mutable fields; tin_* and school_id are immutable
        const body = {
          full_name:               fields.full_name.trim(),
          nic:                     fields.nic.trim() || null,
          gender:                  fields.gender,
          date_of_birth:           fields.date_of_birth,
          present_category:        Number(fields.present_category),
          ssp_status:              fields.ssp_status,
          dcett_status:            fields.dcett_status,
          selection_test_attempt1: fields.selection_test_attempt1 || null,
          selection_test_attempt2: fields.selection_test_attempt2 || null,
          selection_test_attempt3: fields.selection_test_attempt3 || null,
          mediums:                     fields.mediums,
          class_levels:                fields.class_levels,
          education:                   fields.education.map((q) => ({ qualification: q, other_detail: null })),
          professional_qualifications: fields.professional_qualifications,
          subjects:                    fields.subjects,
          phones:   fields.phones.filter((p) => p.phone_number.trim()),
          contract: {
            contract_6month_start: fields.contract_6month_start || null,
            contract_6month_end:   fields.contract_6month_end   || null,
            contract_2nd_start:    null,
            contract_2nd_end:      fields.contract_2nd_end      || null,
            contract_3rd_start:    null,
            contract_3rd_end:      fields.contract_3rd_end      || null,
            contract_3rd_expiry:   null,
          },
        };
        await client.patch(`/teachers/${id}`, body);
        navigate(`/private/teachers/${id}`);
      } else {
        const body = {
          full_name:               fields.full_name.trim(),
          nic:                     fields.nic.trim() || null,
          gender:                  fields.gender,
          date_of_birth:           fields.date_of_birth,
          present_category:        Number(fields.present_category),
          tin_category:            Number(fields.tin_category),
          tin_school_number:       parseInt(school.school_index, 10),
          school_id:               Number(fields.school_id),
          ssp_status:              fields.ssp_status,
          dcett_status:            fields.dcett_status,
          selection_test_attempt1: fields.selection_test_attempt1 || null,
          selection_test_attempt2: fields.selection_test_attempt2 || null,
          selection_test_attempt3: fields.selection_test_attempt3 || null,
          mediums:                     fields.mediums,
          class_levels:                fields.class_levels,
          education:                   fields.education.map((q) => ({ qualification: q, other_detail: null })),
          professional_qualifications: fields.professional_qualifications,
          subjects:                    fields.subjects,
          phones: fields.phones.filter((p) => p.phone_number.trim()),
          ...(
            (fields.contract_6month_start || fields.contract_6month_end ||
             fields.contract_2nd_end      || fields.contract_3rd_end)
              ? {
                  contract: {
                    contract_6month_start: fields.contract_6month_start || null,
                    contract_6month_end:   fields.contract_6month_end   || null,
                    contract_2nd_start:    null,
                    contract_2nd_end:      fields.contract_2nd_end      || null,
                    contract_3rd_start:    null,
                    contract_3rd_end:      fields.contract_3rd_end      || null,
                    contract_3rd_expiry:   null,
                  },
                }
              : {}
          ),
        };
        await client.post('/teachers', body);
        navigate('/private/teachers');
      }
    } catch (err) {
      const msg = err.response?.data?.message ?? `Failed to ${isEdit ? 'update' : 'create'} teacher.`;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading skeleton (edit mode fetching teacher) ──────────────────────────
  if (loadingTeacher) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingMsg}>Loading teacher…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        {isEdit ? 'Edit Teacher' : 'Create Teacher'}
      </h1>

      {/* ── TIN banner ──────────────────────────────────────────────────── */}
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
              required
              disabled={submitting}
            />
          </Field>

          <Field label="NIC">
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

          <Field label="Gender" required>
            <select
              name="gender"
              className={styles.select}
              value={fields.gender}
              onChange={handleChange}
              required
              disabled={submitting}
            >
              <option value="">Select…</option>
              {GENDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Date of birth" required>
            <input
              name="date_of_birth"
              type="date"
              className={styles.input}
              value={fields.date_of_birth}
              onChange={handleChange}
              required
              disabled={submitting}
            />
          </Field>
        </fieldset>

        {/* ── Categories ────────────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Categories</legend>

          <Field
            label="Category"
            required
            hint="Teacher's current grade. Category 1 is assigned by promotion only."
          >
            <select
              name="present_category"
              className={styles.select}
              value={fields.present_category}
              onChange={handleChange}
              disabled={submitting}
            >
              {PRESENT_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

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
              required
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

        {/* ── Training & Selection Test ─────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Training &amp; Selection Test</legend>

          <Field label="SSP Status" hint="Structured Self-paced Programme completion status.">
            <select
              name="ssp_status"
              className={styles.select}
              value={fields.ssp_status}
              onChange={handleChange}
              disabled={submitting}
            >
              {SSP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="DCETT Status" hint="Diploma in Creative and Expressive Teaching Techniques.">
            <select
              name="dcett_status"
              className={styles.select}
              value={fields.dcett_status}
              onChange={handleChange}
              disabled={submitting}
            >
              {DCETT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Selection Test – Attempt 1">
            <select
              className={styles.select}
              value={fields.selection_test_attempt1}
              onChange={(e) => handleAttemptChange('selection_test_attempt1', e.target.value)}
              disabled={submitting}
            >
              {ATTEMPT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field
            label="Selection Test – Attempt 2"
            hint={!fields.selection_test_attempt1 ? 'Attempt 1 must be recorded first.' : undefined}
          >
            <select
              className={styles.select}
              value={fields.selection_test_attempt2}
              onChange={(e) => handleAttemptChange('selection_test_attempt2', e.target.value)}
              disabled={submitting || !fields.selection_test_attempt1}
            >
              {ATTEMPT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field
            label="Selection Test – Attempt 3"
            hint={!fields.selection_test_attempt2 ? 'Attempt 2 must be recorded first.' : undefined}
          >
            <select
              className={styles.select}
              value={fields.selection_test_attempt3}
              onChange={(e) => handleAttemptChange('selection_test_attempt3', e.target.value)}
              disabled={submitting || !fields.selection_test_attempt2}
            >
              {ATTEMPT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
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

        {/* ── Contract Details ───────────────────────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Contract Details</legend>

          <Field label="First appointment date">
            <input
              name="contract_6month_start"
              type="date"
              className={styles.input}
              value={fields.contract_6month_start}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="First contract end date (6 months)">
            <input
              name="contract_6month_end"
              type="date"
              className={styles.input}
              value={fields.contract_6month_end}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Second contract end date">
            <input
              name="contract_2nd_end"
              type="date"
              className={styles.input}
              value={fields.contract_2nd_end}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>

          <Field label="Third contract end date">
            <input
              name="contract_3rd_end"
              type="date"
              className={styles.input}
              value={fields.contract_3rd_end}
              onChange={handleChange}
              disabled={submitting}
            />
          </Field>
        </fieldset>

        {/* ── Qualifications & Teaching Details ─────────────────────────── */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Qualifications &amp; Teaching Details</legend>

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
              {['A/L', 'Graduate', 'MA', 'PhD'].map((eq) => (
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

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() =>
              navigate(isEdit ? `/private/teachers/${id}` : '/private/teachers')
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
