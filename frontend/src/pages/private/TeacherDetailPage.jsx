import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchTeacher } from '../../api/teachers';
import { useAuth } from '../../auth/AuthContext';
import styles from './TeacherDetailPage.module.css';

const READ_ONLY_ROLES = ['principal', 'head_of_hr'];

function getBasePath(role) {
  return READ_ONLY_ROLES.includes(role) ? '/my-school/teachers' : '/private/teachers';
}

const CATEGORY_LABELS = {
  1: 'Cat 1 – Pensionable',
  2: 'Cat 2 – Unregistered Permanent',
  3: 'Cat 3 – Unregistered Training',
  4: 'Cat 4 – Fixed Term',
};

export default function TeacherDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const readOnly = READ_ONLY_ROLES.includes(user?.role);
  const basePath = getBasePath(user?.role);

  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchTeacher(id)
      .then(setTeacher)
      .catch((err) => setError(err.response?.data?.message ?? 'Failed to load teacher.'))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate(basePath)}>
          ← Back to list
        </button>
        <p className={styles.stateMsg}>Loading…</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate(basePath)}>
          ← Back to list
        </button>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  const isRemoved = !teacher.is_active;

  return (
    <div className={styles.page}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <button className={styles.backBtn} onClick={() => navigate(basePath)}>
          ← Back to list
        </button>
        {!readOnly && (
          <div className={styles.actions}>
            <button
              className={styles.editBtn}
              disabled={isRemoved}
              onClick={() => navigate(`/private/teachers/${teacher.id}/edit`)}
            >
              Edit
            </button>
            <button className={styles.removalBtn} disabled={isRemoved}>
              Request Removal
            </button>
          </div>
        )}
      </div>

      {/* ── Page title ──────────────────────────────────────────────────── */}
      <div className={styles.titleRow}>
        <h1 className={styles.heading}>{teacher.full_name}</h1>
        {isRemoved
          ? <span className={styles.badgeRemoved}>Removed</span>
          : <span className={styles.badgeActive}>Active</span>
        }
      </div>

      {isRemoved && teacher.removed_reason && (
        <p className={styles.removedNote}>
          Removed · reason: <strong>{teacher.removed_reason}</strong>
        </p>
      )}

      {/* ── Core fields ─────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Identification</h2>
        <dl className={styles.grid}>
          <Field label="TIN"      value={teacher.tin} mono />
          <Field label="NIC"      value={teacher.nic} mono />
          <Field label="Category" value={CATEGORY_LABELS[teacher.present_category] ?? teacher.present_category} />
          <Field label="Gender"   value={teacher.gender} />
          <Field label="Religion" value={teacher.religion} />
          <Field label="School"   value={teacher.school_name} />
          <Field label="School index" value={teacher.school_index} />
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Personal</h2>
        <dl className={styles.grid}>
          <Field label="Date of birth"  value={fmtDate(teacher.date_of_birth)} />
          <Field label="Age"            value={teacher.age != null ? `${teacher.age} yrs` : null} />
          <Field label="Retirement date" value={fmtDate(teacher.retirement_date)} />
          <Field label="Home address"   value={teacher.home_address} wide />
          <Field label="Email"          value={teacher.email} />
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Service</h2>
        <dl className={styles.grid}>
          <Field label="First appointment" value={fmtDate(teacher.date_of_first_appointment)} />
          <Field label="Service years"     value={teacher.service_years != null ? `${teacher.service_years} yrs` : null} />
          <Field label="Service status"    value={teacher.service_status} />
          <Field label="Confirmation letter" value={teacher.confirmation_letter_status} />
        </dl>
      </section>

      {/* ── Phone numbers ────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Phone Numbers</h2>
        {teacher.phones?.length > 0 ? (
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Primary</th>
              </tr>
            </thead>
            <tbody>
              {teacher.phones.map((p) => (
                <tr key={p.id}>
                  <td className={styles.mono}>{p.phone_number}</td>
                  <td>{p.phone_type ?? '—'}</td>
                  <td>{p.is_primary ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.empty}>No phone numbers recorded.</p>
        )}
      </section>

      {/* ── Teaching details ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Teaching Details</h2>
        <dl className={styles.grid}>
          <ChipField label="Subjects"     items={teacher.subjects} />
          <ChipField label="Mediums"      items={teacher.mediums} />
          <ChipField label="Class levels" items={teacher.class_levels} />
        </dl>
      </section>
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────────────────────────── */

function fmtDate(val) {
  if (!val) return null;
  // ISO date string → locale date (no time)
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Field({ label, value, mono, wide }) {
  return (
    <>
      <dt className={styles.dt}>{label}</dt>
      <dd className={[styles.dd, mono ? styles.mono : '', wide ? styles.wide : ''].join(' ')}>
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
        {items?.length > 0 ? (
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
