import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchVestedSchool } from '../../api/vestedSchools';
import { useAuth } from '../../auth/AuthContext';
import detailStyles from '../private/TeacherDetailPage.module.css';
import listStyles   from '../private/TeacherListPage.module.css';

export default function VestedSchoolDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin_vested';

  const [school,  setSchool]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchVestedSchool(id)
      .then(setSchool)
      .catch((err) =>
        setError(err.response?.data?.message ?? 'Failed to load school.'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className={detailStyles.page}>
        <button className={detailStyles.backBtn} onClick={() => navigate('/vested/schools')}>
          ← Back to list
        </button>
        <p className={detailStyles.stateMsg}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={detailStyles.page}>
        <button className={detailStyles.backBtn} onClick={() => navigate('/vested/schools')}>
          ← Back to list
        </button>
        <p className={detailStyles.error}>{error}</p>
      </div>
    );
  }

  const currentPrincipal  = school.principals?.find((p) => p.is_current);
  const archivedPrincipals = school.principals?.filter((p) => !p.is_current) ?? [];
  const stats              = school.stats ?? [];

  return (
    <div className={detailStyles.page}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className={detailStyles.toolbar}>
        <button className={detailStyles.backBtn} onClick={() => navigate('/vested/schools')}>
          ← Back to list
        </button>
        {isAdmin && (
          <button
            className={detailStyles.editBtn}
            onClick={() => navigate(`/vested/schools/${id}/edit`)}
          >
            Edit School
          </button>
        )}
      </div>

      {/* ── Title ───────────────────────────────────────────────────────────── */}
      <div className={detailStyles.titleRow}>
        <h1 className={detailStyles.heading}>{school.school_name}</h1>
        <span className={detailStyles.badgeActive}>{school.school_index}</span>
      </div>

      {/* ── School Information ──────────────────────────────────────────────── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>School Information</h2>
        <dl className={detailStyles.grid}>
          <Field label="School category"       value={school.school_category} />
          <Field label="Admission type"        value={school.student_admission_type} />
          <Field label="Medium of instruction" value={school.medium_of_instruction} />
          <Field label="School type detail"    value={school.school_type_detail} />
          <Field label="Year established"      value={school.year_established} />
          <Field label="Census number"         value={school.school_census_no} mono />
          <Field label="No. of students"       value={school.no_of_students} />
          <Field label="No. of teachers"       value={school.no_of_teachers} />
          <Field label="Pensionable teachers"  value={school.no_of_pensionable_teachers} />
        </dl>
      </section>

      {/* ── Location & Contact ──────────────────────────────────────────────── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>Location &amp; Contact</h2>
        <dl className={detailStyles.grid}>
          <Field label="Province"                value={school.province} />
          <Field label="District"                value={school.district} />
          <Field label="Region"                  value={school.region} />
          <Field label="Zone"                    value={school.zone} />
          <Field label="Education zone"          value={school.education_zone} />
          <Field label="Divisional secretariat"  value={school.divisional_secretariat} />
          <Field label="Parish"                  value={school.parish} />
          <Field label="Address"                 value={school.school_address} />
          <Field label="Phone"                   value={school.school_phone} mono />
          <Field label="Fax"                     value={school.school_fax}   mono />
          <Field label="Email"                   value={school.school_email} />
        </dl>
      </section>

      {/* ── BOG Religion Breakdown ──────────────────────────────────────────── */}
      {(school.bog_catholic_pct        != null ||
        school.bog_other_christian_pct != null ||
        school.bog_buddhist_pct        != null ||
        school.bog_hindu_pct           != null ||
        school.bog_islam_pct           != null ||
        school.bog_other_religion_pct  != null) && (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Board of Governors — Religion Breakdown</h2>
          <dl className={detailStyles.grid}>
            <Field label="Catholic"        value={fmtPct(school.bog_catholic_pct)} />
            <Field label="Other Christian" value={fmtPct(school.bog_other_christian_pct)} />
            <Field label="Buddhist"        value={fmtPct(school.bog_buddhist_pct)} />
            <Field label="Hindu"           value={fmtPct(school.bog_hindu_pct)} />
            <Field label="Islam"           value={fmtPct(school.bog_islam_pct)} />
            <Field label="Other"           value={fmtPct(school.bog_other_religion_pct)} />
          </dl>
        </section>
      )}

      {/* ── Current Principal ───────────────────────────────────────────────── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>Current Principal</h2>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button className={detailStyles.editBtn} disabled>Edit Principal</button>
            {currentPrincipal && (
              <button className={detailStyles.editBtn} disabled>Archive Principal</button>
            )}
          </div>
        )}

        {currentPrincipal ? (
          <dl className={detailStyles.grid}>
            <Field label="Full name"                   value={currentPrincipal.full_name} />
            <Field label="NIC"                         value={currentPrincipal.nic}    mono />
            <Field label="Gender"                      value={currentPrincipal.gender} />
            <Field label="Religion"                    value={currentPrincipal.religion} />
            <Field label="Date of birth"               value={fmtDate(currentPrincipal.date_of_birth)} />
            <Field label="Retirement date"             value={fmtDate(currentPrincipal.retirement_date)} />
            <Field label="Retiring in"                 value={fmtRetiring(currentPrincipal.retiring_in_years)} />
            <Field label="First appointment"           value={fmtDate(currentPrincipal.first_appointment_date)} />
            <Field label="Appointed to this school"    value={fmtDate(currentPrincipal.appointment_to_present_school)} />
            <Field label="Phone"                       value={currentPrincipal.phone} mono />
            <Field label="Email"                       value={currentPrincipal.email} />
          </dl>
        ) : (
          <p className={detailStyles.stateMsg}>No current principal recorded.</p>
        )}
      </section>

      {/* ── Principal History ───────────────────────────────────────────────── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>Principal History</h2>
        {archivedPrincipals.length === 0 ? (
          <p className={detailStyles.stateMsg}>No archived principals.</p>
        ) : (
          <div className={listStyles.tableWrap}>
            <table className={listStyles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Religion</th>
                  <th>Appointed to school</th>
                  <th>End date</th>
                  <th>Departure reason</th>
                </tr>
              </thead>
              <tbody>
                {archivedPrincipals.map((p) => (
                  <tr key={p.id}>
                    <td>{p.full_name}</td>
                    <td>{p.religion ?? <Nil />}</td>
                    <td>{fmtDate(p.appointment_to_present_school) ?? <Nil />}</td>
                    <td>{fmtDate(p.end_date) ?? <Nil />}</td>
                    <td>{p.departure_reason ?? <Nil />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Student Statistics ──────────────────────────────────────────────── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>Student Statistics</h2>
        {stats.length === 0 ? (
          <p className={detailStyles.stateMsg}>No student statistics recorded.</p>
        ) : (
          <div className={listStyles.tableWrap}>
            <table className={listStyles.table}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Students</th>
                  <th>Teachers</th>
                  <th>Classes</th>
                  <th>Catholic</th>
                  <th>Buddhist</th>
                  <th>Hindu</th>
                  <th>Islam</th>
                  <th>Other Chr.</th>
                  <th>Other Rel.</th>
                  <th>Sinhala</th>
                  <th>Tamil</th>
                  <th>English</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((st) => (
                  <tr key={st.stat_year}>
                    <td className={listStyles.mono}>{st.stat_year}</td>
                    <td>{st.total_students}</td>
                    <td>{st.total_teachers}</td>
                    <td>{st.total_classes}</td>
                    <td>{fmtStatPct(st.pct_catholic,        st.count_catholic)}</td>
                    <td>{fmtStatPct(st.pct_buddhist,        st.count_buddhist)}</td>
                    <td>{fmtStatPct(st.pct_hindu,           st.count_hindu)}</td>
                    <td>{fmtStatPct(st.pct_islam,           st.count_islam)}</td>
                    <td>{fmtStatPct(st.pct_other_christian, st.count_other_christian)}</td>
                    <td>{fmtStatPct(st.pct_other_religion,  st.count_other_religion)}</td>
                    <td>{fmtStatPct(st.pct_sinhala_medium,  st.count_sinhala_medium)}</td>
                    <td>{fmtStatPct(st.pct_tamil_medium,    st.count_tamil_medium)}</td>
                    <td>{fmtStatPct(st.pct_english_medium,  st.count_english_medium)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Remarks / Overview ──────────────────────────────────────────────── */}
      {(school.overview_general      ||
        school.overview_remarks      ||
        school.overview_special_notes ||
        school.overview_challenges) && (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Remarks &amp; Overview</h2>
          <dl className={detailStyles.grid}>
            <Field label="General"       value={school.overview_general} />
            <Field label="Remarks"       value={school.overview_remarks} />
            <Field label="Special notes" value={school.overview_special_notes} />
            <Field label="Challenges"    value={school.overview_challenges} />
          </dl>
        </section>
      )}

    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d)
    ? val
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtPct(val) {
  if (val == null) return null;
  return `${val}%`;
}

function fmtStatPct(pct, count) {
  if (!count) return '—';
  return `${count} (${pct}%)`;
}

function fmtRetiring(years) {
  if (years == null) return null;
  if (years > 0) return `${years} yr${years !== 1 ? 's' : ''}`;
  if (years === 0) return 'This year';
  return `Retired ${Math.abs(years)} yr${Math.abs(years) !== 1 ? 's' : ''} ago`;
}

function Nil() {
  return <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>—</span>;
}

function Field({ label, value, mono }) {
  return (
    <>
      <dt className={detailStyles.dt}>{label}</dt>
      <dd className={[detailStyles.dd, mono ? detailStyles.mono : ''].join(' ')}>
        {value ?? <Nil />}
      </dd>
    </>
  );
}
