import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchRector } from '../../api/rectors';
import styles from './TeacherDetailPage.module.css';

// Same strings as rector_qualifications.qualification — must stay in sync with import script.
// Rectors have LTh in addition to the shared educational set.
const EDUCATIONAL_QUALS  = ['BTh', 'BPh', 'LTh', 'Degree', 'Masters', 'M.Phil', 'PhD'];
const PROFESSIONAL_QUALS = ['COE', 'BEd', 'PGDE', 'MEd', 'Other Dip.'];

export default function RectorDetailPage() {
  const { id }    = useParams();
  const navigate  = useNavigate();

  const [rector,  setRector]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchRector(id)
      .then(setRector)
      .catch((err) =>
        setError(err.response?.data?.message ?? 'Failed to load rector.'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate('/private/rectors')}>
          ← Back to list
        </button>
        <p className={styles.stateMsg}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate('/private/rectors')}>
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
        <button className={styles.backBtn} onClick={() => navigate('/private/rectors')}>
          ← Back to list
        </button>
        <button
          className={styles.editBtn}
          onClick={() => navigate(`/private/rectors/${rector.id}/edit`)}
        >
          Edit
        </button>
      </div>

      {/* ── Title ───────────────────────────────────────────────────────── */}
      <div className={styles.titleRow}>
        <h1 className={styles.heading}>{rector.full_name}</h1>
      </div>

      {/* ── Basic Info ──────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Basic Info</h2>
        <dl className={styles.grid}>
          <Field label="Rector No"              value={rector.rector_no} mono />
          <Field label="School"                 value={rector.present_school_name} />
          <Field label="Registration status"    value={rector.registration_status} />
          <Field label="Date of birth"          value={fmtDate(rector.date_of_birth)} />
          <Field label="First appointment"      value={fmtDate(rector.first_appointment_date)} />
          <Field label="Appt. to present school" value={fmtDate(rector.appointment_to_present_school)} />
          <Field label="Retirement date"        value={fmtDate(rector.retirement_date)} />
        </dl>
      </section>

      {/* ── Qualifications ──────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Qualifications</h2>
        <dl className={styles.grid}>
          <ChipField
            label="Educational"
            items={EDUCATIONAL_QUALS.filter((q) => rector.qualifications?.includes(q))}
          />
          <ChipField
            label="Professional"
            items={PROFESSIONAL_QUALS.filter((q) => rector.qualifications?.includes(q))}
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
