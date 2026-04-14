import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchTeachers } from '../../api/teachers';
import Pagination from '../../components/Pagination';
import styles from './TeacherListPage.module.css';

// present_category numeric → readable label
const CATEGORY_LABELS = {
  1: 'Cat 1 – Pensionable',
  2: 'Cat 2 – Unregistered Permanent',
  3: 'Cat 3 – Unregistered Training',
  4: 'Cat 4 – Fixed Term',
};

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: '1', label: 'Cat 1 – Pensionable' },
  { value: '2', label: 'Cat 2 – Unregistered Permanent' },
  { value: '3', label: 'Cat 3 – Unregistered Training' },
  { value: '4', label: 'Cat 4 – Fixed Term' },
];

const STATUS_OPTIONS = [
  { value: '',    label: 'Active' },
  { value: 'all', label: 'Active + Removed' },
  { value: '0',   label: 'Removed Only' },
];

const PAGE_LIMIT = 20;

export default function TeacherListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Filter state — initialise from URL so browser back/forward works ───────
  const [nameInput, setNameInput] = useState(searchParams.get('name') ?? '');
  const [category,  setCategory]  = useState(searchParams.get('category') ?? '');
  const [isActive,  setIsActive]  = useState(searchParams.get('isActive') ?? '');
  const [page,      setPage]      = useState(Number(searchParams.get('page') ?? 1));

  // ── Data state ─────────────────────────────────────────────────────────────
  const [teachers,   setTeachers]   = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  // Debounce name input — fetch only 400 ms after the user stops typing
  const nameDebounce = useRef(null);
  const [name, setName] = useState(nameInput);

  function handleNameChange(val) {
    setNameInput(val);
    clearTimeout(nameDebounce.current);
    nameDebounce.current = setTimeout(() => {
      setName(val);
      setPage(1);
    }, 400);
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        name:     name       || undefined,
        category: category   || undefined,
        isActive: isActive   || undefined,
        page,
        limit: PAGE_LIMIT,
      };

      // Mirror active filters into the URL (enables shareable links + back nav)
      const urlParams = {};
      if (name)     urlParams.name     = name;
      if (category) urlParams.category = category;
      if (isActive) urlParams.isActive = isActive;
      if (page > 1) urlParams.page     = page;
      setSearchParams(urlParams, { replace: true });

      const result = await fetchTeachers(params);
      setTeachers(result.items);
      setPagination(result.pagination);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to load teachers.');
    } finally {
      setLoading(false);
    }
  }, [name, category, isActive, page, setSearchParams]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when a filter changes (but not when page itself changes)
  function applyFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  return (
    <div className={styles.page}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Private School Teachers</h1>
          {pagination && (
            <p className={styles.total}>{pagination.total} teacher{pagination.total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button
          className={styles.createBtn}
          onClick={() => navigate('/private/teachers/new')}
        >
          + Create Teacher
        </button>
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
          value={category}
          onChange={(e) => applyFilter(setCategory, e.target.value)}
          className={styles.select}
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={isActive}
          onChange={(e) => applyFilter(setIsActive, e.target.value)}
          className={styles.select}
        >
          {STATUS_OPTIONS.map((o) => (
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
              <th>TIN</th>
              <th>Full Name</th>
              <th>Category</th>
              <th>NIC</th>
              <th>School</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className={styles.stateCell}>Loading…</td>
              </tr>
            )}
            {!loading && teachers.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.stateCell}>No teachers found.</td>
              </tr>
            )}
            {!loading && teachers.map((t) => (
              <tr key={t.id} className={!t.is_active ? styles.removedRow : ''}>
                <td className={styles.mono}>{t.tin}</td>
                <td>{t.full_name}</td>
                <td>{CATEGORY_LABELS[t.present_category] ?? t.present_category}</td>
                <td className={styles.mono}>{t.nic ?? '—'}</td>
                <td>{t.school_name ?? '—'}</td>
                <td>
                  {t.is_active
                    ? <span className={styles.badgeActive}>Active</span>
                    : <span className={styles.badgeRemoved}>Removed</span>
                  }
                </td>
                <td>
                  <button
                    className={styles.viewBtn}
                    onClick={() => navigate(`/private/teachers/${t.id}`)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onChange={setPage}
        />
      )}
    </div>
  );
}
