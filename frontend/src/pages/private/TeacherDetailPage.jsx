import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import {
  fetchTeacher,
  uploadTeacherProfilePicture,
  removeTeacherProfilePicture,
  requestTeacherRemoval,
  fetchRemovalRequests,
} from "../../api/teachers";
import { useAuth } from "../../auth/AuthContext";
import ProfilePicture from "../../components/ProfilePicture";
import StatusBadge from "../../components/StatusBadge";
import styles from "./TeacherDetailPage.module.css";

const READ_ONLY_ROLES = ["principal", "head_of_hr"];

function getBasePath(role) {
  return READ_ONLY_ROLES.includes(role)
    ? "/my-school/teachers"
    : "/private/teachers";
}

const CATEGORY_LABELS = {
  1: "Cat 1 – Pensionable",
  2: "Cat 2 – Unregistered Permanent",
  3: "Cat 3 – Unregistered Training",
  4: "Cat 4 – Fixed Term",
};

const SSP_LABELS = {
  Not_Completed: "Not Completed",
  Yes:           "Yes",
  Completed:     "Completed",
};

// DB stores 'Yes' for "Following"
const DCETT_LABELS = {
  Not_Completed: "Not Completed",
  Yes:           "Following",
  Completed:     "Completed",
};

const REASON_LABELS = {
  Resignation:           "Resignation",
  Retirement:            "Retirement",
  Transfer:              "Transfer",
  Qualification_Failure: "Qualification Failure",
};

function fmtAttempt(val) {
  return val ?? "Not Participated";
}

export default function TeacherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const readOnly = READ_ONLY_ROLES.includes(user?.role);
  const basePath = getBasePath(user?.role);

  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingRequest, setPendingRequest] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    const teacherFetch = fetchTeacher(id);
    const pendingFetch = !readOnly
      ? fetchRemovalRequests({ teacherId: id, status: "Pending" })
      : Promise.resolve([]);

    Promise.all([teacherFetch, pendingFetch])
      .then(([teacherData, pendingData]) => {
        setTeacher(teacherData);
        setPendingRequest(pendingData[0] ?? null);
      })
      .catch((err) =>
        setError(err.response?.data?.message ?? "Failed to load teacher."),
      )
      .finally(() => setLoading(false));
  }, [id, readOnly]);

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

  async function handleRequestRemoval() {
    const { value: reason } = await Swal.fire({
      title: "Request Teacher Removal",
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
        const val = document.getElementById("swal-reason").value;
        if (!val) {
          Swal.showValidationMessage("Please select a reason.");
          return false;
        }
        return val;
      },
      confirmButtonText: "Submit Request",
      confirmButtonColor: "#923328",
      showCancelButton: true,
      cancelButtonColor: "#6b7280",
      cancelButtonText: "Cancel",
    });

    if (!reason) return;

    try {
      const result = await requestTeacherRemoval(teacher.id, reason);
      setPendingRequest({
        ...result,
        reason,
        requested_by_username: user?.username,
      });
      await Swal.fire({
        title: "Request submitted",
        text: "The removal request is now pending approval by a second admin.",
        icon: "success",
        confirmButtonColor: "#3B6355",
      });
    } catch (err) {
      await Swal.fire({
        title: "Error",
        text: err.response?.data?.message ?? "Failed to submit removal request.",
        icon: "error",
        confirmButtonColor: "#3B6355",
      });
    }
  }

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
            <button
              className={styles.removalBtn}
              disabled={isRemoved || !!pendingRequest}
              onClick={handleRequestRemoval}
            >
              {pendingRequest ? "Removal Pending" : "Request Removal"}
            </button>
          </div>
        )}
      </div>

      {/* ── Page title ──────────────────────────────────────────────────── */}
      <div className={styles.titleRow}>
        <h1 className={styles.heading}>{teacher.full_name}</h1>
        <StatusBadge status={isRemoved ? 'Removed' : 'Active'} />
      </div>

      {isRemoved && teacher.removed_reason && (
        <p className={styles.removedNote}>
          Removed · reason: <strong>{REASON_LABELS[teacher.removed_reason] ?? teacher.removed_reason}</strong>
        </p>
      )}

      {pendingRequest && !isRemoved && (
        <p className={styles.pendingNote}>
          Removal pending · Requested by <strong>{pendingRequest.requested_by_username ?? "an admin"}</strong> ·
          Reason: <strong>{REASON_LABELS[pendingRequest.reason] ?? pendingRequest.reason}</strong> ·
          Awaiting a second admin to approve.
        </p>
      )}

      {/* ── Profile Picture ──────────────────────────────────────────────── */}
      <ProfilePicture
        picturePath={teacher.profile_picture_path}
        name={teacher.full_name}
        isAdmin={!readOnly && !isRemoved}
        onUpload={async (file) => {
          const updated = await uploadTeacherProfilePicture(teacher.id, file);
          setTeacher(updated);
        }}
        onRemove={async () => {
          const updated = await removeTeacherProfilePicture(teacher.id);
          setTeacher(updated);
        }}
      />

      {/* ── Core fields ─────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Identification</h2>
        <dl className={styles.grid}>
          <Field label="TIN" value={teacher.tin} mono />
          <Field label="NIC" value={teacher.nic} mono />
          <Field
            label="Category"
            value={
              CATEGORY_LABELS[teacher.present_category] ??
              teacher.present_category
            }
          />
          <Field label="Gender" value={teacher.gender} />
          <Field label="Religion" value={teacher.religion} />
          <Field label="School" value={teacher.school_name} />
          <Field label="School index" value={teacher.school_index} />
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Personal</h2>
        <dl className={styles.grid}>
          <Field label="Date of birth" value={fmtDate(teacher.date_of_birth)} />
          <Field
            label="Age"
            value={teacher.age != null ? `${teacher.age} yrs` : null}
          />
          <Field
            label="Retirement date"
            value={fmtDate(teacher.retirement_date)}
          />
          <Field label="Home address" value={teacher.home_address} wide />
          <Field label="Email" value={teacher.email} />
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Service</h2>
        <dl className={styles.grid}>
          <Field
            label="First appointment"
            value={fmtDate(teacher.date_of_first_appointment)}
          />
          <Field
            label="Service years"
            value={
              teacher.service_years != null
                ? `${teacher.service_years} yrs`
                : null
            }
          />
          <Field label="Prior service" value={teacher.service_status ? "Yes" : "No"} />
          <Field
            label="Confirmation letter"
            value={teacher.confirmation_letter_status}
          />
        </dl>
      </section>

      {/* ── Training & Selection Test ────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Training &amp; Selection Test</h2>
        <dl className={styles.grid}>
          <Field label="SSP Status"   value={SSP_LABELS[teacher.ssp_status]   ?? teacher.ssp_status} />
          <Field label="DCETT Status" value={DCETT_LABELS[teacher.dcett_status] ?? teacher.dcett_status} />
          <Field label="Selection Test – Attempt 1" value={fmtAttempt(teacher.selection_test_attempt1)} />
          <Field label="Selection Test – Attempt 2" value={fmtAttempt(teacher.selection_test_attempt2)} />
          <Field label="Selection Test – Attempt 3" value={fmtAttempt(teacher.selection_test_attempt3)} />
        </dl>
      </section>

      {/* ── Contact Information ──────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Contact Information</h2>
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
                  <td>{p.phone_type ?? "—"}</td>
                  <td>{p.is_primary ? "✓" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.empty}>No phone numbers recorded.</p>
        )}
      </section>

      {/* ── Contract Details ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Contract Details</h2>
        <dl className={styles.grid}>
          <Field label="Second contract start"  value={fmtDate(teacher.contract?.contract_2nd_start)} />
          <Field label="Third contract start"   value={fmtDate(teacher.contract?.contract_3rd_start)} />
          <Field label="Third contract expiry"  value={fmtDate(teacher.contract?.contract_3rd_expiry)} />
        </dl>
      </section>

      {/* ── Qualifications & Teaching Details ───────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Qualifications &amp; Teaching Details</h2>
        <dl className={styles.grid}>
          <ChipField label="Mediums"      items={teacher.mediums} />
          <ChipField label="Class levels" items={teacher.class_levels} />
          <ChipField label="Education"    items={(teacher.education ?? []).map((e) => e.qualification)} />
          <ChipField
            label="Professional qualifications"
            items={(teacher.professional_qualifications ?? []).map((q) => q.qualification)}
          />
          <ChipField label="Subjects"     items={teacher.subjects} />
        </dl>
      </section>
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────────────────────────── */

function fmtDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d)
    ? val
    : d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function Field({ label, value, mono, wide }) {
  return (
    <>
      <dt className={styles.dt}>{label}</dt>
      <dd
        className={[
          styles.dd,
          mono ? styles.mono : "",
          wide ? styles.wide : "",
        ].join(" ")}
      >
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
              <span key={item} className={styles.chip}>
                {item}
              </span>
            ))}
          </div>
        ) : (
          <span className={styles.nil}>—</span>
        )}
      </dd>
    </>
  );
}
