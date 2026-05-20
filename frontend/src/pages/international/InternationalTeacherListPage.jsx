import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchInternationalTeachers } from '../../api/internationalTeachers';
import { useAuth } from '../../auth/AuthContext';
import Pagination from '../../components/Pagination';
import StatusBadge from '../../components/StatusBadge';
import styles from '../private/TeacherListPage.module.css';

const CATEGORY_OPTIONS = [
  { value: '',                  label: 'All Categories' },
  { value: 'Permanent',         label: 'Permanent' },
  { value: 'Fixed_Term_Contract', label: 'Fixed Term Contract' },
];

const CATEGORY_LABELS = {
  Permanent:           'Permanent',
  Fixed_Term_Contract: 'Fixed Term',
};

const STATUS_OPTIONS = [
  { value: '',    label: 'Active' },
  { value: 'all', label: 'Active + Removed' },
  { value: '0',   label: 'Removed Only' },
];

const PAGE_LIMIT = 20;

export default function InternationalTeacherListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = user?.role === 'admin_international';
  const basePath = isAdmin ? '/international/teachers' : '/my-school/international/teachers';

  // ── Filter state ─────────────────────────────────────────────────────────
  const [nameInput, setNameInput] = useState(searchParams.get('name') ?? '');
  const [category,  setCategory]  = useState(searchParams.get('category') ?? '');
  const [isActive,  setIsActive]  = useState(searchParams.get('isActive') ?? '');
  const [page,      setPage]      = useState(Number(searchParams.get('page') ?? 1));

  // ── Data state ────────────────────────────────────────────────────────────
  const [teachers,   setTeachers]   = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  // Debounce name input
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

  // ── Fetch ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        name:     name     || undefined,
        category: category || undefined,
        isActive: isActive || undefined,
        page,
        limit: PAGE_LIMIT,
      };

      const urlParams = {};
      if (name)     urlParams.name     = name;
      if (category) urlParams.category = category;
      if (isActive) urlParams.isActive = isActive;
      if (page > 1) urlParams.page     = page;
      setSearchParams(urlParams, { replace: true });

      const result = await fetchInternationalTeachers(params);
      setTeachers(result.items);
      setPagination(result.pagination);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to load teachers.');
    } finally {
      setLoading(false);
    }
  }, [name, category, isActive, page, setSearchParams]);

  useEffect(() => { load(); }, [load]);

  function applyFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  return (
    <div className={styles.page}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>International School Teachers</h1>
          {pagination && (
            <p className={styles.total}>
              {pagination.total} teacher{pagination.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {isAdmin && (
          <button
            className={styles.createBtn}
            onClick={() => navigate('/international/teachers/new')}
          >
            + Create Teacher
          </button>
        )}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
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

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && <p className={styles.error}>{error}</p>}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
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
                <td>{CATEGORY_LABELS[t.category] ?? t.category}</td>
                <td className={styles.mono}>{t.nic ?? '—'}</td>
                <td>{t.school_name ?? '—'}</td>
                <td>
                  <StatusBadge status={t.is_active ? 'Active' : 'Removed'} />
                </td>
                <td>
                  <button
                    className={styles.viewBtn}
                    onClick={() => navigate(`${basePath}/${t.id}`)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
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
