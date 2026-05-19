import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  fetchInternationalTeacher,
  uploadInternationalTeacherProfilePicture,
  removeInternationalTeacherProfilePicture,
  requestInternationalTeacherRemoval,
} from '../../api/internationalTeachers';
import { fetchRemovalRequests } from '../../api/teachers';
import { useAuth } from '../../auth/AuthContext';
import ProfilePicture from '../../components/ProfilePicture';
import styles from '../private/TeacherDetailPage.module.css';

const REASON_LABELS = {
  Resignation:           'Resignation',
  Retirement:            'Retirement',
  Transfer:              'Transfer',
  Qualification_Failure: 'Qualification Failure',
};

function getBasePath(role) {
  return (role === 'principal' || role === 'head_of_hr')
    ? '/my-school/international/teachers'
    : '/international/teachers';
}

export default function InternationalTeacherDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const { user }  = useAuth();
  const isAdmin   = user?.role === 'admin_international';
  const readOnly  = user?.role === 'principal' || user?.role === 'head_of_hr';
  const basePath  = getBasePath(user?.role);

  const [teacher,        setTeacher]        = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [pendingRequest, setPendingRequest] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError('');

    const teacherFetch = fetchInternationalTeacher(id);
    const pendingFetch = isAdmin
      ? fetchRemovalRequests({ teacherId: id, teacherType: 'International', status: 'Pending' })
      : Promise.resolve([]);

    Promise.all([teacherFetch, pendingFetch])
      .then(([teacherData, pendingData]) => {
        setTeacher(teacherData);
        setPendingRequest(pendingData[0] ?? null);
      })
      .catch((err) =>
        setError(err.response?.data?.message ?? 'Failed to load teacher.'),
      )
      .finally(() => setLoading(false));
  }, [id, isAdmin]);

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

  async function handleRequestRemoval() {
    const { value: reason } = await Swal.fire({
      title: 'Request Teacher Removal',
      html: `
        <select id="swal-reason" class="swal2-select" style="width:100%;margin-top:0.5rem">
          <option value="" disabled selected>Select reason…</option>
          <option value="Resignation">Resignation</option>
          <option value="Retirement">Retirement</option>
          <option value="Transfer">Transfer</option>
          <option value="Qualification_Failure">Qualification Failure</option>
        </select>
      `,
      focusConfirm: false,
      preConfirm: () => {
        const val = document.getElementById('swal-reason').value;
        if (!val) { Swal.showValidationMessage('Please select a reason.'); return false; }
        return val;
      },
      confirmButtonText: 'Submit Request',
      confirmButtonColor: '#b91c1c',
      showCancelButton: true,
      cancelButtonColor: '#6b7280',
      cancelButtonText: 'Cancel',
    });

    if (!reason) return;

    try {
      const result = await requestInternationalTeacherRemoval(teacher.id, reason);
      setPendingRequest({ ...result, reason, requested_by_username: user?.username });
      await Swal.fire({
        title: 'Request submitted',
        text: 'The removal request is now pending approval by a second admin.',
        icon: 'success',
        confirmButtonColor: '#4f46e5',
      });
    } catch (err) {
      await Swal.fire({
        title: 'Error',
        text: err.response?.data?.message ?? 'Failed to submit removal request.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  return (
    <div className={styles.page}>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <button className={styles.backBtn} onClick={() => navigate(basePath)}>
          ← Back to list
        </button>
        {isAdmin && (
          <div className={styles.actions}>
            <button
              className={styles.editBtn}
              disabled={isRemoved}
              onClick={() => navigate(`/international/teachers/${teacher.id}/edit`)}
            >
              Edit
            </button>
            <button
              className={styles.removalBtn}
              disabled={isRemoved || !!pendingRequest}
              onClick={handleRequestRemoval}
            >
              {pendingRequest ? 'Removal Pending' : 'Request Removal'}
            </button>
          </div>
        )}
      </div>

      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <div className={styles.titleRow}>
        <h1 className={styles.heading}>{teacher.full_name}</h1>
        <span className={isRemoved ? styles.badgeRemoved : styles.badgeActive}>
          {isRemoved ? 'Removed' : 'Active'}
        </span>
      </div>

      {isRemoved && teacher.removed_reason && (
        <p className={styles.removedNote}>
          Removed · reason: <strong>{REASON_LABELS[teacher.removed_reason] ?? teacher.removed_reason}</strong>
        </p>
      )}

      {pendingRequest && !isRemoved && (
        <p className={styles.removedNote} style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
          Removal pending · Requested by <strong>{pendingRequest.requested_by_username ?? 'an admin'}</strong> ·
          Reason: <strong>{REASON_LABELS[pendingRequest.reason] ?? pendingRequest.reason}</strong> ·
          Awaiting a second admin to approve.
        </p>
      )}

      {/* ── Profile Picture ───────────────────────────────────────────────── */}
      <ProfilePicture
        picturePath={teacher.profile_picture_path}
        name={teacher.full_name}
        isAdmin={isAdmin && !isRemoved}
        onUpload={async (file) => {
          const updated = await uploadInternationalTeacherProfilePicture(teacher.id, file);
          setTeacher(updated);
        }}
        onRemove={async () => {
          const updated = await removeInternationalTeacherProfilePicture(teacher.id);
          setTeacher(updated);
        }}
      />

      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Identity</h2>
        <dl className={styles.grid}>
          <Field label="TIN"         value={teacher.tin}  mono />
          <Field label="Category"    value={fmtCategory(teacher.category)} />
          <Field label="Designation" value={teacher.designation} />
          <Field label="NIC"         value={teacher.nic}  mono />
          <Field label="Religion"    value={teacher.religion} />
          <Field label="Email"       value={teacher.email} />
          <Field label="Address"     value={teacher.address} />
        </dl>
      </section>

      {/* ── Employment ────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Employment</h2>
        <dl className={styles.grid}>
          <Field label="School"                     value={teacher.school_name} />
          <Field label="Date of birth"              value={fmtDate(teacher.date_of_birth)} />
          <Field label="Age"                        value={teacher.age != null ? `${teacher.age} yrs` : null} />
          <Field label="First appointment"          value={fmtDate(teacher.date_of_first_appointment)} />
          <Field
            label="Service"
            value={
              teacher.service_years != null
                ? `${teacher.service_years} yr${teacher.service_years !== 1 ? 's' : ''}${
                    teacher.service_months ? ` ${teacher.service_months} mo` : ''
                  }`
                : null
            }
          />
          <Field label="Retirement date"            value={fmtDate(teacher.retirement_date)} />
        </dl>
      </section>

      {/* ── Phones ────────────────────────────────────────────────────────── */}
      {teacher.phones && teacher.phones.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Phone Numbers</h2>
          <dl className={styles.grid}>
            {teacher.phones.map((p) => (
              <Field
                key={p.id}
                label={`${p.phone_type}${p.is_primary ? ' (Primary)' : ''}`}
                value={p.phone_number}
                mono
              />
            ))}
          </dl>
        </section>
      )}

      {/* ── Contract ──────────────────────────────────────────────────────── */}
      {teacher.contract && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Contract</h2>
          <dl className={styles.grid}>
            {teacher.category === 'Permanent' ? (
              <>
                <Field label="Probation start" value={fmtDate(teacher.contract.probation_start)} />
                <Field label="Probation end"   value={fmtDate(teacher.contract.probation_end)} />
              </>
            ) : (
              <>
                <Field label="Contract start"  value={fmtDate(teacher.contract.contract_start)} />
                <Field label="Contract end"    value={fmtDate(teacher.contract.contract_end)} />
                <Field label="Contract expiry" value={fmtDate(teacher.contract.contract_expiry)} />
              </>
            )}
          </dl>
        </section>
      )}

      {/* ── Mediums ───────────────────────────────────────────────────────── */}
      {teacher.mediums && teacher.mediums.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Teaching Mediums</h2>
          <ChipList items={teacher.mediums} />
        </section>
      )}

      {/* ── Class Levels ──────────────────────────────────────────────────── */}
      {teacher.class_levels && teacher.class_levels.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Class Levels</h2>
          <ChipList items={teacher.class_levels} />
        </section>
      )}

      {/* ── Education ─────────────────────────────────────────────────────── */}
      {teacher.education && teacher.education.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Education</h2>
          <ChipList items={teacher.education} />
        </section>
      )}

      {/* ── Professional Qualifications ───────────────────────────────────── */}
      {teacher.professional_qualifications && teacher.professional_qualifications.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Professional Qualifications</h2>
          <ChipList items={teacher.professional_qualifications.map((q) => q.qualification ?? q)} />
        </section>
      )}

      {/* ── Subjects ──────────────────────────────────────────────────────── */}
      {teacher.subjects && teacher.subjects.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Subjects</h2>
          <ChipList items={teacher.subjects.map((s) => s.subject_name ?? s)} />
        </section>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d)
    ? val
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCategory(val) {
  if (!val) return null;
  return val === 'Fixed_Term_Contract' ? 'Fixed Term Contract' : val;
}

function ChipList({ items }) {
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            background: 'var(--color-surface, #f1f5f9)',
            border: '1px solid var(--color-border, #cbd5e1)',
            borderRadius: '999px',
            padding: '0.2rem 0.75rem',
            fontSize: '0.85rem',
          }}
        >
          {item}
        </li>
      ))}
    </ul>
  );
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
