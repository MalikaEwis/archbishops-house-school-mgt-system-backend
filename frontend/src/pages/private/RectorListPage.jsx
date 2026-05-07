import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRectors } from '../../api/rectors';
import styles from './TeacherListPage.module.css';

const REGISTRATION_OPTIONS = [
  { value: '',           label: 'All Statuses' },
  { value: 'Registered', label: 'Registered' },
  { value: 'Pending',    label: 'Pending' },
];

export default function RectorListPage() {
  const navigate = useNavigate();

  const [nameInput,           setNameInput]           = useState('');
  const [name,                setName]                = useState('');
  const [registrationStatus,  setRegistrationStatus]  = useState('');
  const [rectors,             setRectors]             = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [error,               setError]               = useState('');

  const nameDebounce = useRef(null);

  function handleNameChange(val) {
    setNameInput(val);
    clearTimeout(nameDebounce.current);
    nameDebounce.current = setTimeout(() => setName(val), 400);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchRectors({
        name:               name               || undefined,
        registrationStatus: registrationStatus || undefined,
      });
      setRectors(result);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to load rectors.');
    } finally {
      setLoading(false);
    }
  }, [name, registrationStatus]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={styles.page}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Rectors</h1>
          {!loading && !error && (
            <p className={styles.total}>{rectors.length} rector{rectors.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className={styles.filters}>
        <input
          type="search"
          placeholder="Search by name…"
          value={nameInput}
          onChange={(e) => handleNameChange(e.target.value)}
          className={styles.searchInput}
        />
        <select
          value={registrationStatus}
          onChange={(e) => setRegistrationStatus(e.target.value)}
          className={styles.select}
        >
          {REGISTRATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && <p className={styles.error}>{error}</p>}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>No</th>
              <th>Full Name</th>
              <th>School</th>
              <th>Registration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className={styles.stateCell}>Loading…</td>
              </tr>
            )}
            {!loading && rectors.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.stateCell}>No rectors found.</td>
              </tr>
            )}
            {!loading && rectors.map((r) => (
              <tr key={r.id}>
                <td className={styles.mono}>{r.rector_no}</td>
                <td>{r.full_name}</td>
                <td>{r.present_school_name ?? '—'}</td>
                <td>{r.registration_status ?? '—'}</td>
                <td>
                  <button
                    className={styles.viewBtn}
                    onClick={() => navigate(`/private/rectors/${r.id}`)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
