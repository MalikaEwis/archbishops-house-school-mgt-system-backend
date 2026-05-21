import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchVestedSchool,
  addPrincipal as apiAddPrincipal,
  updatePrincipal as apiUpdatePrincipal,
  archivePrincipal as apiArchivePrincipal,
  restorePrincipal as apiRestorePrincipal,
  upsertStats as apiUpsertStats,
  deleteStats as apiDeleteStats,
} from "../../api/vestedSchools";
import { useAuth } from "../../auth/AuthContext";
import detailStyles from "../private/TeacherDetailPage.module.css";
import listStyles from "../private/TeacherListPage.module.css";
import formStyles from "../private/TeacherFormPage.module.css";
import vestedStyles from "./VestedSchoolDetailPage.module.css";

// ── Empty form templates ──────────────────────────────────────────────────────

const EMPTY_PRINCIPAL = {
  full_name: "",
  nic: "",
  gender: "",
  religion: "",
  date_of_birth: "",
  first_appointment_date: "",
  appointment_to_present_school: "",
  retirement_date: "",
  phone: "",
  email: "",
};

const EMPTY_ARCHIVE = { end_date: "", departure_reason: "" };

const EMPTY_STATS = {
  stat_year: "",
  count_catholic: "",
  count_other_christian: "",
  count_buddhist: "",
  count_hindu: "",
  count_islam: "",
  count_other_religion: "",
  count_sinhala_medium: "",
  count_tamil_medium: "",
  count_english_medium: "",
  total_teachers: "",
  total_classes: "",
};

// ── Utility ───────────────────────────────────────────────────────────────────

function toDateInput(val) {
  return val ? String(val).slice(0, 10) : "";
}
function toStr(val) {
  return val == null ? "" : String(val);
}
function strOrNull(val) {
  const t = String(val ?? "").trim();
  return t === "" ? null : t;
}
function numOrNull(val) {
  if (val === "" || val == null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// Returns ISO yyyy-mm-dd retirement date (DOB + 60 years), or '' if DOB is blank/invalid.
function calcRetirementDate(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + 60);
  return d.toISOString().slice(0, 10);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VestedSchoolDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin_vested";

  // ── School data ────────────────────────────────────────────────────────────
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Principal inline form state ────────────────────────────────────────────
  // mode: null | 'add' | 'edit' | 'archive'
  const [principalMode, setPrincipalMode] = useState(null);
  const [principalForm, setPrincipalForm] = useState(EMPTY_PRINCIPAL);
  const [archiveForm, setArchiveForm] = useState(EMPTY_ARCHIVE);
  const [principalSaving, setPrincipalSaving] = useState(false);
  const [principalError, setPrincipalError] = useState("");

  // ── Stats inline form state ────────────────────────────────────────────────
  // mode: null | 'form'
  const [statsMode, setStatsMode] = useState(null);
  const [statsForm, setStatsForm] = useState(EMPTY_STATS);
  const [statsEditYear, setStatsEditYear] = useState(null); // null = adding new
  const [statsSaving, setStatsSaving] = useState(false);
  const [statsError, setStatsError] = useState("");

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const refreshSchool = useCallback(
    () =>
      fetchVestedSchool(id)
        .then(setSchool)
        .catch((err) =>
          setError(err.response?.data?.message ?? "Failed to load school."),
        ),
    [id],
  );

  useEffect(() => {
    setLoading(true);
    setError("");
    refreshSchool().finally(() => setLoading(false));
  }, [refreshSchool]);

  // ── Principal handlers ─────────────────────────────────────────────────────

  function openAddPrincipal() {
    setPrincipalForm(EMPTY_PRINCIPAL);
    setPrincipalError("");
    setPrincipalMode("add");
  }

  function openEditPrincipal(p) {
    setPrincipalForm({
      full_name: toStr(p.full_name),
      nic: toStr(p.nic),
      gender: toStr(p.gender),
      religion: toStr(p.religion),
      date_of_birth: toDateInput(p.date_of_birth),
      first_appointment_date: toDateInput(p.first_appointment_date),
      appointment_to_present_school: toDateInput(
        p.appointment_to_present_school,
      ),
      retirement_date: toDateInput(p.retirement_date),
      phone: toStr(p.phone),
      email: toStr(p.email),
    });
    setPrincipalError("");
    setPrincipalMode("edit");
  }

  function openArchivePrincipal() {
    setArchiveForm(EMPTY_ARCHIVE);
    setPrincipalError("");
    setPrincipalMode("archive");
  }

  function cancelPrincipal() {
    setPrincipalMode(null);
    setPrincipalError("");
  }

  async function savePrincipal() {
    if (!principalForm.full_name.trim()) return;

    // Part 4 — date-order validation
    const dob = principalForm.date_of_birth;
    const ret = principalForm.retirement_date;
    const fad = principalForm.first_appointment_date;
    const atps = principalForm.appointment_to_present_school;

    if (dob && ret && ret < dob) {
      setPrincipalError(
        "Retirement date cannot be earlier than date of birth.",
      );
      return;
    }
    if (dob && fad && fad < dob) {
      setPrincipalError(
        "First appointment date cannot be earlier than date of birth.",
      );
      return;
    }
    if (fad && atps && atps < fad) {
      setPrincipalError(
        "Appointment to this school cannot be earlier than first appointment date.",
      );
      return;
    }

    setPrincipalError("");
    setPrincipalSaving(true);
    const currentPrincipal = school.principals?.find((p) => p.is_current);
    try {
      const body = {
        full_name: principalForm.full_name.trim(),
        nic: strOrNull(principalForm.nic),
        gender: strOrNull(principalForm.gender),
        religion: strOrNull(principalForm.religion),
        date_of_birth: principalForm.date_of_birth || null,
        first_appointment_date: principalForm.first_appointment_date || null,
        appointment_to_present_school:
          principalForm.appointment_to_present_school || null,
        retirement_date: principalForm.retirement_date || null,
        phone: strOrNull(principalForm.phone),
        email: strOrNull(principalForm.email),
      };
      if (principalMode === "add") {
        await apiAddPrincipal(id, body);
      } else {
        await apiUpdatePrincipal(id, currentPrincipal.id, body);
      }
      await refreshSchool();
      setPrincipalMode(null);
    } catch (err) {
      setPrincipalError(
        err.response?.data?.message ?? "Failed to save principal.",
      );
    } finally {
      setPrincipalSaving(false);
    }
  }

  async function handleRestorePrincipal(pid) {
    setPrincipalError("");
    try {
      await apiRestorePrincipal(id, pid);
      await refreshSchool();
    } catch (err) {
      setPrincipalError(
        err.response?.data?.message ?? "Failed to restore principal.",
      );
    }
  }

  async function saveArchive() {
    const currentPrincipal = school.principals?.find((p) => p.is_current);
    if (!currentPrincipal) return;
    const result = await Swal.fire({
      title: "Archive principal?",
      text: "They will be moved to the principal history and will no longer be the active principal.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#923328",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, archive",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    setPrincipalError("");
    setPrincipalSaving(true);
    try {
      await apiArchivePrincipal(id, currentPrincipal.id, {
        end_date: archiveForm.end_date || null,
        departure_reason: strOrNull(archiveForm.departure_reason),
      });
      await refreshSchool();
      setPrincipalMode(null);
    } catch (err) {
      setPrincipalError(
        err.response?.data?.message ?? "Failed to archive principal.",
      );
    } finally {
      setPrincipalSaving(false);
    }
  }

  // ── Stats handlers ─────────────────────────────────────────────────────────

  function openAddStats() {
    setStatsForm(EMPTY_STATS);
    setStatsEditYear(null);
    setStatsError("");
    setStatsMode("form");
  }

  function openEditStats(st) {
    setStatsForm({
      stat_year: toStr(st.stat_year),
      count_catholic: toStr(st.count_catholic),
      count_other_christian: toStr(st.count_other_christian),
      count_buddhist: toStr(st.count_buddhist),
      count_hindu: toStr(st.count_hindu),
      count_islam: toStr(st.count_islam),
      count_other_religion: toStr(st.count_other_religion),
      count_sinhala_medium: toStr(st.count_sinhala_medium),
      count_tamil_medium: toStr(st.count_tamil_medium),
      count_english_medium: toStr(st.count_english_medium),
      total_teachers: toStr(st.total_teachers),
      total_classes: toStr(st.total_classes),
    });
    setStatsEditYear(st.stat_year);
    setStatsError("");
    setStatsMode("form");
  }

  function cancelStats() {
    setStatsMode(null);
    setStatsError("");
  }

  async function saveStats() {
    // Part 3 — validation
    const year = Number(statsForm.stat_year);

    if (!statsForm.stat_year || !Number.isInteger(year)) {
      setStatsError("Year must be a whole number.");
      return;
    }
    if (year > new Date().getFullYear()) {
      setStatsError("Year cannot be in the future.");
      return;
    }
    if (statsEditYear == null) {
      const exists = (school.stats ?? []).some((st) => st.stat_year === year);
      if (exists) {
        setStatsError(
          `Statistics for ${year} already exist. Use Edit to update.`,
        );
        return;
      }
    }
    const COUNT_FIELDS = [
      "count_catholic",
      "count_other_christian",
      "count_buddhist",
      "count_hindu",
      "count_islam",
      "count_other_religion",
      "count_sinhala_medium",
      "count_tamil_medium",
      "count_english_medium",
      "total_teachers",
      "total_classes",
    ];
    for (const field of COUNT_FIELDS) {
      if (statsForm[field] !== "" && Number(statsForm[field]) < 0) {
        setStatsError("Counts cannot be negative.");
        return;
      }
    }

    setStatsError("");
    setStatsSaving(true);
    try {
      const body = {
        stat_year: year,
        count_catholic: numOrNull(statsForm.count_catholic) ?? 0,
        count_other_christian: numOrNull(statsForm.count_other_christian) ?? 0,
        count_buddhist: numOrNull(statsForm.count_buddhist) ?? 0,
        count_hindu: numOrNull(statsForm.count_hindu) ?? 0,
        count_islam: numOrNull(statsForm.count_islam) ?? 0,
        count_other_religion: numOrNull(statsForm.count_other_religion) ?? 0,
        count_sinhala_medium: numOrNull(statsForm.count_sinhala_medium) ?? 0,
        count_tamil_medium: numOrNull(statsForm.count_tamil_medium) ?? 0,
        count_english_medium: numOrNull(statsForm.count_english_medium) ?? 0,
        total_teachers: numOrNull(statsForm.total_teachers) ?? 0,
        total_classes: numOrNull(statsForm.total_classes) ?? 0,
      };
      // Response is the full updated stats array (newest first)
      const updatedStats = await apiUpsertStats(id, body);
      setSchool((prev) => ({ ...prev, stats: updatedStats }));
      setStatsMode(null);
    } catch (err) {
      setStatsError(
        err.response?.data?.message ?? "Failed to save statistics.",
      );
    } finally {
      setStatsSaving(false);
    }
  }

  async function handleDeleteStats(year) {
    const result = await Swal.fire({
      title: `Delete ${year} statistics?`,
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#923328",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    setStatsError("");
    try {
      await apiDeleteStats(id, year);
      setSchool((prev) => ({
        ...prev,
        stats: (prev.stats ?? []).filter((st) => st.stat_year !== year),
      }));
    } catch (err) {
      setStatsError(
        err.response?.data?.message ?? "Failed to delete statistics.",
      );
    }
  }

  // ── Loading / error page ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={detailStyles.page}>
        <button
          className={detailStyles.backBtn}
          onClick={() => navigate("/vested/schools")}
        >
          ← Back to list
        </button>
        <p className={detailStyles.stateMsg}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={detailStyles.page}>
        <button
          className={detailStyles.backBtn}
          onClick={() => navigate("/vested/schools")}
        >
          ← Back to list
        </button>
        <p className={detailStyles.error}>{error}</p>
      </div>
    );
  }

  const currentPrincipal = school.principals?.find((p) => p.is_current);
  const archivedPrincipals = (school.principals ?? []).filter(
    (p) => !p.is_current,
  );
  // Highest ID = most recently inserted row = most recently archived principal
  const mostRecentlyArchivedId =
    archivedPrincipals.length > 0
      ? Math.max(...archivedPrincipals.map((p) => p.id))
      : null;
  const stats = school.stats ?? [];

  return (
    <div className={detailStyles.page}>
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className={detailStyles.toolbar}>
        <button
          className={detailStyles.backBtn}
          onClick={() => navigate("/vested/schools")}
        >
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

      {/* ── Title ────────────────────────────────────────────────────────────── */}
      <div className={detailStyles.titleRow}>
        <h1 className={detailStyles.heading}>{school.school_name}</h1>
        <span className={vestedStyles.indexBadge}>{school.school_index}</span>
      </div>

      {/* ── School Information ────────────────────────────────────────────────── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>School Information</h2>
        <dl className={detailStyles.grid}>
          <Field label="School category" value={school.school_category} />
          <Field label="Admission type" value={school.student_admission_type} />
          <Field
            label="Medium of instruction"
            value={school.medium_of_instruction}
          />
          <Field label="School type detail" value={school.school_type_detail} />
          <Field label="Year established" value={school.year_established} />
          <Field label="Census number" value={school.school_census_no} mono />
          <Field label="No. of students" value={school.no_of_students} />
          <Field label="No. of teachers" value={school.no_of_teachers} />
          <Field
            label="Pensionable teachers"
            value={school.no_of_pensionable_teachers}
          />
        </dl>
      </section>

      {/* ── Location & Contact ───────────────────────────────────────────────── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>Location &amp; Contact</h2>
        <dl className={detailStyles.grid}>
          <Field label="Province" value={school.province} />
          <Field label="District" value={school.district} />
          <Field label="Region" value={school.region} />
          <Field label="Zone" value={school.zone} />
          <Field label="Education zone" value={school.education_zone} />
          <Field
            label="Divisional secretariat"
            value={school.divisional_secretariat}
          />
          <Field label="Parish" value={school.parish} />
          <Field label="Address" value={school.school_address} />
          <Field label="Phone" value={school.school_phone} mono />
          <Field label="Fax" value={school.school_fax} mono />
          <Field label="Email" value={school.school_email} />
        </dl>
      </section>

      {/* ── BOG Religion Breakdown ───────────────────────────────────────────── */}
      {(school.bog_catholic_pct != null ||
        school.bog_other_christian_pct != null ||
        school.bog_buddhist_pct != null ||
        school.bog_hindu_pct != null ||
        school.bog_islam_pct != null ||
        school.bog_other_religion_pct != null) && (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>
            Board of Governors — Religion Breakdown
          </h2>
          <dl className={detailStyles.grid}>
            <Field label="Catholic" value={fmtPct(school.bog_catholic_pct)} />
            <Field
              label="Other Christian"
              value={fmtPct(school.bog_other_christian_pct)}
            />
            <Field label="Buddhist" value={fmtPct(school.bog_buddhist_pct)} />
            <Field label="Hindu" value={fmtPct(school.bog_hindu_pct)} />
            <Field label="Islam" value={fmtPct(school.bog_islam_pct)} />
            <Field
              label="Other"
              value={fmtPct(school.bog_other_religion_pct)}
            />
          </dl>
        </section>
      )}

      {/* ── Current Principal ─────────────────────────────────────────────────── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>Current Principal</h2>

        {/* Admin action buttons — only visible when no inline form is open */}
        {isAdmin && principalMode === null && (
          <div className={vestedStyles.adminActions}>
            {currentPrincipal ? (
              <>
                <button
                  className={detailStyles.editBtn}
                  onClick={() => openEditPrincipal(currentPrincipal)}
                >
                  Edit Principal
                </button>
                <button
                  className={detailStyles.removalBtn}
                  onClick={openArchivePrincipal}
                >
                  Archive Principal
                </button>
              </>
            ) : (
              <button
                className={detailStyles.editBtn}
                onClick={openAddPrincipal}
              >
                + Add Principal
              </button>
            )}
          </div>
        )}

        {/* ── Add / Edit principal inline form ── */}
        {isAdmin && (principalMode === "add" || principalMode === "edit") && (
          <div className={vestedStyles.inlineForm}>
            <p className={vestedStyles.formTitle}>
              {principalMode === "add" ? "Add Principal" : "Edit Principal"}
            </p>
            {principalError && (
              <p className={`${detailStyles.error} ${vestedStyles.formError}`}>
                {principalError}
              </p>
            )}

            <div className={vestedStyles.twoCol}>
              <FormField label="Full name *">
                <input
                  name="full_name"
                  type="text"
                  className={formStyles.input}
                  value={principalForm.full_name}
                  onChange={(e) =>
                    setPrincipalForm((p) => ({
                      ...p,
                      full_name: e.target.value,
                    }))
                  }
                  disabled={principalSaving}
                  placeholder="Full name"
                />
              </FormField>

              <FormField label="NIC">
                <input
                  name="nic"
                  type="text"
                  className={formStyles.input}
                  value={principalForm.nic}
                  onChange={(e) =>
                    setPrincipalForm((p) => ({ ...p, nic: e.target.value }))
                  }
                  disabled={principalSaving}
                  placeholder="e.g. 901234567V"
                />
              </FormField>

              <FormField label="Gender">
                <select
                  name="gender"
                  className={formStyles.select}
                  value={principalForm.gender}
                  onChange={(e) =>
                    setPrincipalForm((p) => ({ ...p, gender: e.target.value }))
                  }
                  disabled={principalSaving}
                >
                  <option value="">Select…</option>
                  {["Male", "Female", "Other"].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Religion">
                <input
                  name="religion"
                  type="text"
                  className={formStyles.input}
                  value={principalForm.religion}
                  onChange={(e) =>
                    setPrincipalForm((p) => ({
                      ...p,
                      religion: e.target.value,
                    }))
                  }
                  disabled={principalSaving}
                  placeholder="e.g. Roman Catholic"
                />
              </FormField>

              <FormField label="Date of birth">
                <input
                  name="date_of_birth"
                  type="date"
                  className={formStyles.input}
                  value={principalForm.date_of_birth}
                  onChange={(e) => {
                    const dob = e.target.value;
                    setPrincipalForm((p) => ({
                      ...p,
                      date_of_birth: dob,
                      // Auto-fill retirement date (DOB + 60 yrs) when the field is still empty
                      retirement_date:
                        p.retirement_date || calcRetirementDate(dob),
                    }));
                  }}
                  disabled={principalSaving}
                />
              </FormField>

              <FormField label="Retirement date">
                <input
                  name="retirement_date"
                  type="date"
                  className={formStyles.input}
                  value={principalForm.retirement_date}
                  onChange={(e) =>
                    setPrincipalForm((p) => ({
                      ...p,
                      retirement_date: e.target.value,
                    }))
                  }
                  disabled={principalSaving}
                />
              </FormField>

              <FormField label="First appointment date">
                <input
                  name="first_appointment_date"
                  type="date"
                  className={formStyles.input}
                  value={principalForm.first_appointment_date}
                  onChange={(e) =>
                    setPrincipalForm((p) => ({
                      ...p,
                      first_appointment_date: e.target.value,
                    }))
                  }
                  disabled={principalSaving}
                />
              </FormField>

              <FormField label="Appointed to this school">
                <input
                  name="appointment_to_present_school"
                  type="date"
                  className={formStyles.input}
                  value={principalForm.appointment_to_present_school}
                  onChange={(e) =>
                    setPrincipalForm((p) => ({
                      ...p,
                      appointment_to_present_school: e.target.value,
                    }))
                  }
                  disabled={principalSaving}
                />
              </FormField>

              <FormField label="Phone">
                <input
                  name="phone"
                  type="tel"
                  className={formStyles.input}
                  value={principalForm.phone}
                  onChange={(e) =>
                    setPrincipalForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  disabled={principalSaving}
                />
              </FormField>

              <FormField label="Email">
                <input
                  name="email"
                  type="email"
                  className={formStyles.input}
                  value={principalForm.email}
                  onChange={(e) =>
                    setPrincipalForm((p) => ({ ...p, email: e.target.value }))
                  }
                  disabled={principalSaving}
                />
              </FormField>
            </div>

            <div className={vestedStyles.actionRow}>
              <button
                className={formStyles.cancelBtn}
                onClick={cancelPrincipal}
                disabled={principalSaving}
              >
                Cancel
              </button>
              <button
                className={formStyles.submitBtn}
                onClick={savePrincipal}
                disabled={principalSaving || !principalForm.full_name.trim()}
              >
                {principalSaving ? "Saving…" : "Save Principal"}
              </button>
            </div>
          </div>
        )}

        {/* ── Archive inline form ── */}
        {isAdmin && principalMode === "archive" && (
          <div className={vestedStyles.inlineForm}>
            <p className={vestedStyles.formTitle}>Archive Current Principal</p>
            {principalError && (
              <p className={`${detailStyles.error} ${vestedStyles.formError}`}>
                {principalError}
              </p>
            )}

            <div className={vestedStyles.twoCol}>
              <FormField label="End date">
                <input
                  name="end_date"
                  type="date"
                  className={formStyles.input}
                  value={archiveForm.end_date}
                  onChange={(e) =>
                    setArchiveForm((p) => ({ ...p, end_date: e.target.value }))
                  }
                  disabled={principalSaving}
                />
              </FormField>

              <FormField label="Departure reason">
                <input
                  name="departure_reason"
                  type="text"
                  className={formStyles.input}
                  value={archiveForm.departure_reason}
                  onChange={(e) =>
                    setArchiveForm((p) => ({
                      ...p,
                      departure_reason: e.target.value,
                    }))
                  }
                  disabled={principalSaving}
                  placeholder="e.g. Retirement, Transfer…"
                />
              </FormField>
            </div>

            <div className={vestedStyles.actionRow}>
              <button
                className={formStyles.cancelBtn}
                onClick={cancelPrincipal}
                disabled={principalSaving}
              >
                Cancel
              </button>
              <button
                className={vestedStyles.archiveBtnDanger}
                onClick={saveArchive}
                disabled={principalSaving}
              >
                {principalSaving ? "Archiving…" : "Archive Principal"}
              </button>
            </div>
          </div>
        )}

        {/* ── Read-only principal view (shown when no form is open) ── */}
        {principalMode === null &&
          (currentPrincipal ? (
            <dl className={detailStyles.grid}>
              <Field label="Full name" value={currentPrincipal.full_name} />
              <Field label="NIC" value={currentPrincipal.nic} mono />
              <Field label="Gender" value={currentPrincipal.gender} />
              <Field label="Religion" value={currentPrincipal.religion} />
              <Field
                label="Date of birth"
                value={fmtDate(currentPrincipal.date_of_birth)}
              />
              <Field
                label="Retirement date"
                value={fmtDate(currentPrincipal.retirement_date)}
              />
              <Field
                label="Retiring in"
                value={fmtRetiring(currentPrincipal.retiring_in_years)}
              />
              <Field
                label="First appointment"
                value={fmtDate(currentPrincipal.first_appointment_date)}
              />
              <Field
                label="Appointed to this school"
                value={fmtDate(currentPrincipal.appointment_to_present_school)}
              />
              <Field label="Phone" value={currentPrincipal.phone} mono />
              <Field label="Email" value={currentPrincipal.email} />
            </dl>
          ) : (
            <p className={detailStyles.stateMsg}>
              No current principal recorded.
            </p>
          ))}
      </section>

      {/* ── Principal History ─────────────────────────────────────────────────── */}
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
                  {isAdmin && !currentPrincipal && <th></th>}
                </tr>
              </thead>
              <tbody>
                {archivedPrincipals.map((p) => (
                  <tr key={p.id}>
                    <td>{p.full_name}</td>
                    <td>{p.religion ?? <Nil />}</td>
                    <td>
                      {fmtDate(p.appointment_to_present_school) ?? <Nil />}
                    </td>
                    <td>{fmtDate(p.end_date) ?? <Nil />}</td>
                    <td>{p.departure_reason ?? <Nil />}</td>
                    {isAdmin && !currentPrincipal && (
                      <td className={vestedStyles.actionCell}>
                        {p.id === mostRecentlyArchivedId && (
                          <button
                            className={`${detailStyles.editBtn} ${vestedStyles.smallBtn}`}
                            onClick={() => handleRestorePrincipal(p.id)}
                          >
                            Restore as Principal
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Student Statistics ────────────────────────────────────────────────── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>Student Statistics</h2>

        {/* Admin action bar */}
        {isAdmin && statsMode === null && (
          <div className={vestedStyles.statsBar}>
            <button className={detailStyles.editBtn} onClick={openAddStats}>
              + Add Year
            </button>
          </div>
        )}

        {/* Delete / non-form error */}
        {statsMode === null && statsError && (
          <p className={`${detailStyles.error} ${vestedStyles.statsBar}`}>
            {statsError}
          </p>
        )}

        {/* ── Stats inline form ── */}
        {isAdmin && statsMode === "form" && (
          <div className={vestedStyles.inlineForm}>
            <p className={vestedStyles.formTitle}>
              {statsEditYear != null
                ? `Edit Statistics — ${statsEditYear}`
                : "Add Statistics"}
            </p>
            {statsError && (
              <p className={`${detailStyles.error} ${vestedStyles.formError}`}>
                {statsError}
              </p>
            )}

            {/* Year + Totals row */}
            <div className={vestedStyles.threeCol}>
              <FormField label="Year *">
                <input
                  name="stat_year"
                  type="number"
                  className={formStyles.input}
                  value={statsForm.stat_year}
                  onChange={(e) =>
                    setStatsForm((p) => ({ ...p, stat_year: e.target.value }))
                  }
                  disabled={statsSaving || statsEditYear != null}
                  placeholder="e.g. 2024"
                  min="1900"
                  max="2100"
                />
              </FormField>

              <FormField label="Total teachers">
                <input
                  name="total_teachers"
                  type="number"
                  className={formStyles.input}
                  value={statsForm.total_teachers}
                  onChange={(e) =>
                    setStatsForm((p) => ({
                      ...p,
                      total_teachers: e.target.value,
                    }))
                  }
                  disabled={statsSaving}
                  min="0"
                />
              </FormField>

              <FormField label="Total classes">
                <input
                  name="total_classes"
                  type="number"
                  className={formStyles.input}
                  value={statsForm.total_classes}
                  onChange={(e) =>
                    setStatsForm((p) => ({
                      ...p,
                      total_classes: e.target.value,
                    }))
                  }
                  disabled={statsSaving}
                  min="0"
                />
              </FormField>
            </div>

            {/* Religion counts */}
            <p className={vestedStyles.subLabel}>Student Religion Counts</p>
            <div className={vestedStyles.threeCol}>
              {[
                ["count_catholic", "Catholic"],
                ["count_other_christian", "Other Christian"],
                ["count_buddhist", "Buddhist"],
                ["count_hindu", "Hindu"],
                ["count_islam", "Islam"],
                ["count_other_religion", "Other Religion"],
              ].map(([name, label]) => (
                <FormField key={name} label={label}>
                  <input
                    name={name}
                    type="number"
                    className={formStyles.input}
                    value={statsForm[name]}
                    onChange={(e) =>
                      setStatsForm((p) => ({ ...p, [name]: e.target.value }))
                    }
                    disabled={statsSaving}
                    min="0"
                  />
                </FormField>
              ))}
            </div>

            {/* Medium counts */}
            <p className={vestedStyles.subLabel}>Student Medium Counts</p>
            <div className={vestedStyles.threeCol}>
              {[
                ["count_sinhala_medium", "Sinhala Medium"],
                ["count_tamil_medium", "Tamil Medium"],
                ["count_english_medium", "English Medium"],
              ].map(([name, label]) => (
                <FormField key={name} label={label}>
                  <input
                    name={name}
                    type="number"
                    className={formStyles.input}
                    value={statsForm[name]}
                    onChange={(e) =>
                      setStatsForm((p) => ({ ...p, [name]: e.target.value }))
                    }
                    disabled={statsSaving}
                    min="0"
                  />
                </FormField>
              ))}
            </div>

            <p className={vestedStyles.subNote}>
              Total students is auto-computed from religion counts.
            </p>

            <div className={vestedStyles.actionRow}>
              <button
                className={formStyles.cancelBtn}
                onClick={cancelStats}
                disabled={statsSaving}
              >
                Cancel
              </button>
              <button
                className={formStyles.submitBtn}
                onClick={saveStats}
                disabled={statsSaving || !statsForm.stat_year}
              >
                {statsSaving ? "Saving…" : "Save Statistics"}
              </button>
            </div>
          </div>
        )}

        {/* Stats table */}
        {stats.length === 0 ? (
          statsMode === null && (
            <p className={detailStyles.stateMsg}>
              No student statistics recorded.
            </p>
          )
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
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {stats.map((st) => (
                  <tr key={st.stat_year}>
                    <td className={listStyles.mono}>{st.stat_year}</td>
                    <td>{st.total_students}</td>
                    <td>{st.total_teachers}</td>
                    <td>{st.total_classes}</td>
                    <td>{fmtStatPct(st.count_catholic, st.total_students)}</td>
                    <td>{fmtStatPct(st.count_buddhist, st.total_students)}</td>
                    <td>{fmtStatPct(st.count_hindu, st.total_students)}</td>
                    <td>{fmtStatPct(st.count_islam, st.total_students)}</td>
                    <td>
                      {fmtStatPct(st.count_other_christian, st.total_students)}
                    </td>
                    <td>
                      {fmtStatPct(st.count_other_religion, st.total_students)}
                    </td>
                    <td>
                      {fmtStatPct(st.count_sinhala_medium, st.total_students)}
                    </td>
                    <td>
                      {fmtStatPct(st.count_tamil_medium, st.total_students)}
                    </td>
                    <td>
                      {fmtStatPct(st.count_english_medium, st.total_students)}
                    </td>
                    {isAdmin && (
                      <td className={vestedStyles.actionCell}>
                        <button
                          className={`${detailStyles.editBtn} ${vestedStyles.smallBtn}`}
                          onClick={() => openEditStats(st)}
                        >
                          Edit
                        </button>
                        <button
                          className={`${detailStyles.removalBtn} ${vestedStyles.smallBtn}`}
                          onClick={() => handleDeleteStats(st.stat_year)}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Remarks / Overview ───────────────────────────────────────────────── */}
      {(school.overview_general ||
        school.overview_remarks ||
        school.overview_special_notes ||
        school.overview_challenges) && (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Overview of School Highlighting</h2>
          <dl className={detailStyles.grid}>
            <Field label="Vesting information" value={school.overview_general} />
            <Field label="Arbitration info" value={school.overview_remarks} />
            <Field label="Devesting info" value={school.overview_special_notes} />
            <Field label="Other remarks" value={school.overview_challenges} />
          </dl>
        </section>
      )}
    </div>
  );
}

// ── Display helpers ───────────────────────────────────────────────────────────

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

function fmtPct(val) {
  if (val == null) return null;
  return `${val}%`;
}

function fmtStatPct(count, total) {
  if (!count) return "—";
  if (!total) return String(count);
  return `${count} (${((count / total) * 100).toFixed(1)}%)`;
}

function fmtRetiring(years) {
  if (years == null) return null;
  if (years > 0) return `${years} yr${years !== 1 ? "s" : ""}`;
  if (years === 0) return "This year";
  return `Retired ${Math.abs(years)} yr${Math.abs(years) !== 1 ? "s" : ""} ago`;
}

function Nil() {
  return <span className={detailStyles.nil}>—</span>;
}

// Read-only label/value pair for the definition list grid
function Field({ label, value, mono }) {
  return (
    <>
      <dt className={detailStyles.dt}>{label}</dt>
      <dd
        className={[detailStyles.dd, mono ? detailStyles.mono : ""].join(" ")}
      >
        {value ?? <Nil />}
      </dd>
    </>
  );
}

// Label + input wrapper for inline forms
function FormField({ label, children }) {
  return (
    <div className={formStyles.field}>
      <label className={formStyles.label}>{label}</label>
      {children}
    </div>
  );
}
