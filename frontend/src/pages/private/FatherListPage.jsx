import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFathers } from '../../api/fathers';
import styles from './TeacherListPage.module.css';

export default function FatherListPage() {
  const navigate = useNavigate();

  const [nameInput, setNameInput] = useState('');
  const [name,      setName]      = useState('');
  const [fathers,   setFathers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

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
      const result = await fetchFathers({ name: name || undefined });
      setFathers(result);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to load fathers.');
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={styles.page}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Fathers</h1>
          {!loading && !error && (
            <p className={styles.total}>{fathers.length} father{fathers.length !== 1 ? 's' : ''}</p>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className={styles.stateCell}>Loading…</td>
              </tr>
            )}
            {!loading && fathers.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.stateCell}>No fathers found.</td>
              </tr>
            )}
            {!loading && fathers.map((f) => (
              <tr key={f.id}>
                <td className={styles.mono}>{f.father_no}</td>
                <td>{f.full_name}</td>
                <td>{f.school_name ?? '—'}</td>
                <td>
                  <button
                    className={styles.viewBtn}
                    onClick={() => navigate(`/private/fathers/${f.id}`)}
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