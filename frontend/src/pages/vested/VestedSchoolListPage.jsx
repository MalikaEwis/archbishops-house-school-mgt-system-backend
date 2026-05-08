import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchVestedSchools } from '../../api/vestedSchools';
import { useAuth } from '../../auth/AuthContext';
import styles from '../private/TeacherListPage.module.css';

const ZONE_OPTIONS = [
  { value: '', label: 'All Zones' },
  { value: 'Colombo',              label: 'Colombo' },
  { value: 'Gampaha',              label: 'Gampaha' },
  { value: 'Homagama',             label: 'Homagama' },
  { value: 'Kalutara',             label: 'Kalutara' },
  { value: 'Kelaniya',             label: 'Kelaniya' },
  { value: 'Matugama',             label: 'Matugama' },
  { value: 'Minuwangoda',          label: 'Minuwangoda' },
  { value: 'Negombo',              label: 'Negombo' },
  { value: 'Piliyandala',          label: 'Piliyandala' },
  { value: 'Sri Jayewardenapura',  label: 'Sri Jayewardenapura' },
];

const DISTRICT_OPTIONS = [
  { value: '', label: 'All Districts' },
  { value: 'Colombo',  label: 'Colombo' },
  { value: 'Gampaha',  label: 'Gampaha' },
  { value: 'Kalutara', label: 'Kalutara' },
];

const REGION_OPTIONS = [
  { value: '', label: 'All Regions' },
  { value: 'Colombo',    label: 'Colombo' },
  { value: 'Ja-ela',     label: 'Ja-ela' },
  { value: 'Missionary', label: 'Missionary' },
  { value: 'Negombo',    label: 'Negombo' },
];

const RELIGION_OPTIONS = [
  { value: '',              label: 'All Religions' },
  { value: 'Roman Catholic', label: 'Roman Catholic' },
  { value: 'Buddhist',      label: 'Buddhist' },
  { value: 'Hindu',         label: 'Hindu' },
  { value: 'Islam',         label: 'Islam' },
  { value: 'Christian',     label: 'Christian' },
  { value: 'Non-Catholic',  label: 'Non-Catholic' },
];

export default function VestedSchoolListPage() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const isAdmin    = user?.role === 'admin_vested';
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Filter state ─────────────────────────────────────────────────────────
  const [nameInput,      setNameInput]      = useState(searchParams.get('name')              ?? '');
  const [zone,           setZone]           = useState(searchParams.get('zone')              ?? '');
  const [district,       setDistrict]       = useState(searchParams.get('district')          ?? '');
  const [region,         setRegion]         = useState(searchParams.get('region')            ?? '');
  const [principalRelig, setPrincipalRelig] = useState(searchParams.get('principalReligion') ?? '');

  // Debounced name used for the actual fetch
  const [name, setName] = useState(nameInput);
  const nameDebounce = useRef(null);

  function handleNameChange(val) {
    setNameInput(val);
    clearTimeout(nameDebounce.current);
    nameDebounce.current = setTimeout(() => setName(val), 400);
  }

  // ── Data state ────────────────────────────────────────────────────────────
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filters = {
        zone:              zone              || undefined,
        district:          district          || undefined,
        region:            region            || undefined,
        principalReligion: principalRelig    || undefined,
      };

      const urlParams = {};
      if (name)          urlParams.name              = name;
      if (zone)          urlParams.zone              = zone;
      if (district)      urlParams.district          = district;
      if (region)        urlParams.region            = region;
      if (principalRelig) urlParams.principalReligion = principalRelig;
      setSearchParams(urlParams, { replace: true });

      const rows = await fetchVestedSchools(filters);

      // Client-side name filter (backend does not support it natively)
      const filtered = name
        ? rows.filter((s) =>
            s.school_name.toLowerCase().includes(name.toLowerCase()),
          )
        : rows;

      setSchools(filtered);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to load schools.');
    } finally {
      setLoading(false);
    }
  }, [name, zone, district, region, principalRelig, setSearchParams]);

  useEffect(() => { load(); }, [load]);

  function applyFilter(setter, value) {
    setter(value);
  }

  return (
    <div className={styles.page}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Vested Schools</h1>
          {!loading && (
            <p className={styles.total}>
              {schools.length} school{schools.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {isAdmin && (
          <button
            className={styles.createBtn}
            onClick={() => navigate('/vested/schools/new')}
          >
            + Create School
          </button>
        )}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className={styles.filters}>
        <input
          type="search"
          placeholder="Search by school name…"
          value={nameInput}
          onChange={(e) => handleNameChange(e.target.value)}
          className={styles.searchInput}
        />
        <select
          value={zone}
          onChange={(e) => applyFilter(setZone, e.target.value)}
          className={styles.select}
        >
          {ZONE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={district}
          onChange={(e) => applyFilter(setDistrict, e.target.value)}
          className={styles.select}
        >
          {DISTRICT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={region}
          onChange={(e) => applyFilter(setRegion, e.target.value)}
          className={styles.select}
        >
          {REGION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={principalRelig}
          onChange={(e) => applyFilter(setPrincipalRelig, e.target.value)}
          className={styles.select}
        >
          {RELIGION_OPTIONS.map((o) => (
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
              <th>Index</th>
              <th>School Name</th>
              <th>Zone</th>
              <th>District</th>
              <th>Current Principal</th>
              <th>Total Students</th>
              <th>Catholic %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className={styles.stateCell}>Loading…</td>
              </tr>
            )}
            {!loading && schools.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.stateCell}>No schools found.</td>
              </tr>
            )}
            {!loading && schools.map((s) => (
              <tr key={s.id}>
                <td className={styles.mono}>{s.school_index}</td>
                <td>{s.school_name}</td>
                <td>{s.zone ?? '—'}</td>
                <td>{s.district ?? '—'}</td>
                <td>{s.current_principal_name ?? <span className={styles.nil}>—</span>}</td>
                <td>{s.latest_total_students ?? <span className={styles.nil}>—</span>}</td>
                <td>
                  {s.latest_pct_catholic != null
                    ? `${s.latest_pct_catholic}%`
                    : <span className={styles.nil}>—</span>
                  }
                </td>
                <td>
                  <button
                    className={styles.viewBtn}
                    onClick={() => navigate(`/vested/schools/${s.id}`)}
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
