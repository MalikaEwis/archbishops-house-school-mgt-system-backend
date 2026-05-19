import { useState, useRef } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../../auth/AuthContext';
import { resetImportPrivate, resetImportInternational } from '../../api/admin';
import detailStyles from './TeacherDetailPage.module.css';

const LABEL = {
  admin_private:       'Private Schools',
  admin_international: 'International Schools',
};

// ─── Shared table styles ──────────────────────────────────────────────────────

const tbl = {
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.78rem',
  },
  th: {
    background: '#f3f4f6',
    borderBottom: '1px solid #e5e7eb',
    color: '#374151',
    fontWeight: 600,
    padding: '0.4rem 0.6rem',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  td: {
    borderBottom: '1px solid #f3f4f6',
    color: '#374151',
    padding: '0.35rem 0.6rem',
    verticalAlign: 'top',
  },
  scroll: {
    maxHeight: '260px',
    overflowY: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
  },
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, accent, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <p style={{ fontWeight: 600, fontSize: '0.82rem', color: accent, margin: 0 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Placeholders detail ──────────────────────────────────────────────────────

function PlaceholdersDetail({ rows }) {
  if (!rows || rows.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0 }}>No placeholder rows inserted.</p>;
  }
  return (
    <div style={tbl.scroll}>
      <table style={tbl.table}>
        <thead>
          <tr>
            <th style={tbl.th}>Sheet</th>
            <th style={tbl.th}>Row</th>
            <th style={tbl.th}>TIN</th>
            <th style={tbl.th}>School</th>
            <th style={tbl.th}>Placeholder NIC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={tbl.td}>{r.sheet}</td>
              <td style={{ ...tbl.td, fontFamily: 'monospace' }}>{r.row}</td>
              <td style={{ ...tbl.td, fontFamily: 'monospace' }}>{r.tin}</td>
              <td style={tbl.td}>{r.school}</td>
              <td style={{ ...tbl.td, fontFamily: 'monospace', color: '#6366f1' }}>{r.placeholderNic}</td>
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
    return <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0 }}>No rows skipped.</p>;
  }
  return (
    <div style={tbl.scroll}>
      <table style={tbl.table}>
        <thead>
          <tr>
            <th style={tbl.th}>Sheet</th>
            <th style={tbl.th}>Row</th>
            <th style={tbl.th}>Teacher</th>
            <th style={tbl.th}>School</th>
            <th style={tbl.th}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={tbl.td}>{r.sheet}</td>
              <td style={{ ...tbl.td, fontFamily: 'monospace' }}>{r.row}</td>
              <td style={tbl.td}>{r.name ?? <span style={{ color: '#9ca3af' }}>—</span>}</td>
              <td style={tbl.td}>{r.school}</td>
              <td style={{ ...tbl.td, color: '#ca8a04' }}>{r.reason}</td>
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
    return <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0 }}>No errors.</p>;
  }
  return (
    <div style={tbl.scroll}>
      <table style={tbl.table}>
        <thead>
          <tr>
            <th style={tbl.th}>Sheet</th>
            <th style={tbl.th}>Row</th>
            <th style={tbl.th}>Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={tbl.td}>{r.sheet}</td>
              <td style={{ ...tbl.td, fontFamily: 'monospace' }}>{r.row}</td>
              <td style={{ ...tbl.td, color: '#dc2626' }}>{r.message}</td>
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
    <div style={{
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '1rem 1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    }}>
      {/* Title */}
      <p style={{ fontWeight: 700, margin: 0, fontSize: '0.9rem' }}>{label}</p>

      {/* Summary counts */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
        <span style={{ color: '#16a34a' }}>
          Inserted: <strong>{stats.inserted}</strong>
        </span>
        <span style={{ color: '#6366f1' }}>
          Placeholders: <strong>{stats.placeholders}</strong>
        </span>
        <span style={{ color: '#ca8a04' }}>
          Skipped: <strong>{stats.skipped}</strong>
        </span>
        <span style={{ color: stats.errors > 0 ? '#dc2626' : '#6b7280' }}>
          Errors: <strong>{stats.errors}</strong>
        </span>
      </div>

      {/* Placeholder rows */}
      <Section title={`Placeholder rows (${stats.placeholders})`} accent="#6366f1">
        <PlaceholdersDetail rows={stats.placeholderDetails} />
      </Section>

      {/* Skipped rows */}
      <Section title={`Skipped rows (${stats.skipped})`} accent="#ca8a04">
        <SkippedDetail rows={stats.skippedDetails} />
      </Section>

      {/* Errors */}
      <Section title={`Errors (${stats.errors})`} accent="#dc2626">
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
      confirmButtonColor: '#b91c1c',
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
    <div className={detailStyles.page} style={{ maxWidth: '900px' }}>
      <h1 className={detailStyles.heading}>Import / Reset — {moduleLabel}</h1>

      <div style={{
        background: '#fef3c7',
        border: '1px solid #fde68a',
        borderRadius: '8px',
        color: '#92400e',
        fontSize: '0.875rem',
        padding: '0.75rem 1rem',
      }}>
        <strong>Warning:</strong> Uploading a file will <strong>erase all current {moduleLabel} teacher records</strong> and replace them with the contents of the XLSX file. This action is irreversible.
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.4rem', fontSize: '0.875rem' }}>
            Select XLSX file
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            style={{ fontSize: '0.875rem' }}
          />
          {file && (
            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        <div>
          <button
            type="submit"
            disabled={!file || loading}
            className={detailStyles.removalBtn}
            style={{ opacity: !file || loading ? 0.5 : 1 }}
          >
            {loading ? 'Importing…' : 'Reset & Import'}
          </button>
        </div>
      </form>

      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</p>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontWeight: 600, color: '#16a34a', margin: 0 }}>Import complete.</p>
          {result.active        && <StatsBlock label="Active teachers"         stats={result.active} />}
          {result.retired       && <StatsBlock label="Retired teachers"        stats={result.retired} />}
          {result.international && <StatsBlock label="International teachers"  stats={result.international} />}
        </div>
      )}
    </div>
  );
}
