import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchFather } from '../../api/fathers';
import styles from './TeacherDetailPage.module.css';

// Same strings as father_qualifications.qualification — must stay in sync with import script.
const EDUCATIONAL_QUALS  = ['BTh', 'BPh', 'Degree', 'Masters', 'M.Phil', 'PhD'];
const PROFESSIONAL_QUALS = ['COE', 'BEd', 'PGDE', 'MEd', 'Other Dip.'];

export default function FatherDetailPage() {
  const { id }    = useParams();
  const navigate  = useNavigate();

  const [father,  setFather]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchFather(id)
      .then(setFather)
      .catch((err) =>
        setError(err.response?.data?.message ?? 'Failed to load father.'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate('/private/fathers')}>
          ← Back to list
        </button>
        <p className={styles.stateMsg}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate('/private/fathers')}>
          ← Back to list
        </button>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <button className={styles.backBtn} onClick={() => navigate('/private/fathers')}>
          ← Back to list
        </button>
        <button
          className={styles.editBtn}
          onClick={() => navigate(`/private/fathers/${father.id}/edit`)}
        >
          Edit
        </button>
      </div>

      {/* ── Title ───────────────────────────────────────────────────────── */}
      <div className={styles.titleRow}>
        <h1 className={styles.heading}>{father.full_name}</h1>
      </div>

      {/* ── Basic Info ──────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Basic Info</h2>
        <dl className={styles.grid}>
          <Field label="Father No"              value={father.father_no} mono />
          <Field label="School"                 value={father.school_name} />
          <Field label="Registration"           value={father.registration} />
          <Field label="Ordination date"        value={fmtDate(father.ordination_date)} />
          <Field label="First appointment"      value={fmtDate(father.first_appointment_date)} />
          <Field label="Present school appt."   value={fmtDate(father.present_school_appointment_date)} />
          <Field label="Five-year completion"   value={fmtDate(father.five_year_completion)} />
          <Field
            label="Total service"
            value={father.total_service_years != null ? `${father.total_service_years} yrs` : null}
          />
          <Field label="Evaluation"             value={father.evaluation} />
        </dl>
      </section>

      {/* ── Qualifications ──────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Qualifications</h2>
        <dl className={styles.grid}>
          <ChipField
            label="Educational"
            items={EDUCATIONAL_QUALS.filter((q) => father.qualifications?.includes(q))}
          />
          <ChipField
            label="Professional"
            items={PROFESSIONAL_QUALS.filter((q) => father.qualifications?.includes(q))}
          />
        </dl>
      </section>
    </div>
  );
}

function fmtDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d)
    ? val
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Field({ label, value, mono }) {
  return (
    <>
      <dt className={styles.dt}>{label}</dt>
      <dd className={[styles.dd, mono ? styles.mono : ''].join(' ')}>
        {value ?? <span className={styles.nil}>—</span>}
      </dd>
    </>
  );
}

function ChipField({ label, items }) {
  return (
    <>
      <dt className={styles.dt}>{label}</dt>
      <dd className={styles.dd}>
        {items.length > 0 ? (
          <div className={styles.chips}>
            {items.map((item) => (
              <span key={item} className={styles.chip}>{item}</span>
            ))}
          </div>
        ) : (
          <span className={styles.nil}>—</span>
        )}
      </dd>
    </>
  );
}
