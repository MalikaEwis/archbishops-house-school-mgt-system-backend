import { useState, useRef } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../../auth/AuthContext';
import { resetImportPrivate, resetImportInternational } from '../../api/admin';
import styles from './AdminImportPage.module.css';

const LABEL = {
  admin_private:       'Private Schools',
  admin_international: 'International Schools',
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

const SECTION_TITLE_CLASS = {
  placeholder: styles.sectionPlaceholder,
  skipped:     styles.sectionSkipped,
  error:       styles.sectionError,
  inserted:    styles.sectionInserted,
};

function Section({ title, type, children }) {
  const titleClass = SECTION_TITLE_CLASS[type] ?? styles.sectionError;
  return (
    <div className={styles.section}>
      <p className={`${styles.sectionTitle} ${titleClass}`}>{title}</p>
      {children}
    </div>
  );
}

// ─── Placeholders detail ──────────────────────────────────────────────────────

function PlaceholdersDetail({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className={styles.emptyMsg}>No placeholder rows inserted.</p>;
  }
  return (
    <div className={styles.scrollWrap}>
      <table className={styles.detailTable}>
        <thead>
          <tr>
            <th>Sheet</th>
            <th>Row</th>
            <th>TIN</th>
            <th>School</th>
            <th>Placeholder NIC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.sheet}</td>
              <td className={styles.tdMono}>{r.row}</td>
              <td className={styles.tdMono}>{r.tin}</td>
              <td>{r.school}</td>
              <td className={`${styles.tdMono} ${styles.tdInfo}`}>{r.placeholderNic}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Skipped detail ───────────────────────────────────────────────────────────

function SkippedDetail({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className={styles.emptyMsg}>No rows skipped.</p>;
  }
  return (
    <div className={styles.scrollWrap}>
      <table className={styles.detailTable}>
        <thead>
          <tr>
            <th>Sheet</th>
            <th>Row</th>
            <th>Teacher</th>
            <th>School</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.sheet}</td>
              <td className={styles.tdMono}>{r.row}</td>
              <td>{r.name ?? <span className={styles.tdMuted}>—</span>}</td>
              <td>{r.school}</td>
              <td className={styles.tdAmber}>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Errors detail ────────────────────────────────────────────────────────────

function ErrorsDetail({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className={styles.emptyMsg}>No errors.</p>;
  }
  return (
    <div className={styles.scrollWrap}>
      <table className={styles.detailTable}>
        <thead>
          <tr>
            <th>Sheet</th>
            <th>Row</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.sheet}</td>
              <td className={styles.tdMono}>{r.row}</td>
              <td className={styles.tdDanger}>{r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Stats block for one import group ────────────────────────────────────────

function StatsBlock({ label, stats }) {
  return (
    <div className={styles.statsBlock}>
      <p className={styles.statsTitle}>{label}</p>

      <div className={styles.counts}>
        <span className={styles.countInserted}>
          Inserted: <strong>{stats.inserted}</strong>
        </span>
        <span className={styles.countPlaceholder}>
          Placeholders: <strong>{stats.placeholders}</strong>
        </span>
        <span className={styles.countSkipped}>
          Skipped: <strong>{stats.skipped}</strong>
        </span>
        <span className={stats.errors > 0 ? styles.countError : styles.countNeutral}>
          Errors: <strong>{stats.errors}</strong>
        </span>
      </div>

      <Section title={`Placeholder rows (${stats.placeholders})`} type="placeholder">
        <PlaceholdersDetail rows={stats.placeholderDetails} />
      </Section>

      <Section title={`Skipped rows (${stats.skipped})`} type="skipped">
        <SkippedDetail rows={stats.skippedDetails} />
      </Section>

      <Section title={`Errors (${stats.errors})`} type="error">
        <ErrorsDetail rows={stats.errorDetails} />
      </Section>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminImportPage() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [file, setFile]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  const moduleLabel = LABEL[user?.role] ?? 'School';
  const isPrivate   = user?.role === 'admin_private';

  function handleFileChange(e) {
    const f = e.target.files[0] ?? null;
    setFile(f);
    setResult(null);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;

    const { isConfirmed } = await Swal.fire({
      title: 'Reset and re-import?',
      html: `<p>This will <strong>permanently delete all existing ${moduleLabel} teacher data</strong> and replace it with the uploaded file.</p><p style="margin-top:0.5rem"><strong>This cannot be undone.</strong></p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#923328',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, reset and import',
      cancelButtonText: 'Cancel',
    });
    if (!isConfirmed) return;

    setLoading(true);
    setResult(null);
    setError('');
    try {
      const data = isPrivate
        ? await resetImportPrivate(file)
        : await resetImportInternational(file);
      setResult(data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err.response?.data?.message ?? 'Import failed. Check server logs.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Import / Reset — {moduleLabel}</h1>

      <div className={styles.warningBox}>
        <strong>Warning:</strong> Uploading a file will <strong>erase all current {moduleLabel} teacher records</strong> and replace them with the contents of the XLSX file. This action is irreversible.
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div>
          <label className={styles.fileLabel}>Select XLSX file</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
          />
          {file && (
            <p className={styles.fileName}>
              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        <div>
          <button
            type="submit"
            disabled={!file || loading}
            className={styles.importBtn}
          >
            {loading ? 'Importing…' : 'Reset & Import'}
          </button>
        </div>
      </form>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {result && (
        <div className={styles.resultList}>
          <p className={styles.successMsg}>Import complete.</p>
          {result.active        && <StatsBlock label="Active teachers"        stats={result.active} />}
          {result.retired       && <StatsBlock label="Retired teachers"       stats={result.retired} />}
          {result.international && <StatsBlock label="International teachers" stats={result.international} />}
        </div>
      )}
    </div>
  );
}
