import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  fetchRemovalRequests,
  approveRemovalRequest,
  rejectRemovalRequest,
} from '../../api/teachers';
import detailStyles from '../private/TeacherDetailPage.module.css';
import listStyles from '../private/TeacherListPage.module.css';

const STATUS_TABS = ['Pending', 'Approved', 'Rejected', 'All'];

const REASON_LABELS = {
  Resignation:           'Resignation',
  Retirement:            'Retirement',
  Transfer:              'Transfer',
  Qualification_Failure: 'Qualification Failure',
};

function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d)
    ? val
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InternationalRemovalRequestsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [requests,     setRequests]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = { teacherType: 'International' };
    if (statusFilter !== 'All') params.status = statusFilter;
    fetchRemovalRequests(params)
      .then(setRequests)
      .catch((err) => setError(err.response?.data?.message ?? 'Failed to load requests.'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(req) {
    const { isConfirmed } = await Swal.fire({
      title: 'Approve removal?',
      html: `<p>This will <strong>permanently clear all personal data</strong> for TIN <strong>${req.teacher_tin ?? '—'}</strong>${req.teacher_name ? ` (${req.teacher_name})` : ''}.</p><p style="margin-top:0.5rem"><strong>This cannot be undone.</strong></p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#b91c1c',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, approve removal',
      cancelButtonText: 'Cancel',
    });
    if (!isConfirmed) return;

    try {
      await approveRemovalRequest(req.id);
      load();
    } catch (err) {
      await Swal.fire({
        title: 'Error',
        text: err.response?.data?.message ?? 'Failed to approve removal.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async function handleReject(req) {
    const { value: note, isConfirmed } = await Swal.fire({
      title: 'Reject removal request?',
      input: 'textarea',
      inputLabel: 'Rejection note (optional)',
      inputPlaceholder: 'Reason for rejection…',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Reject Request',
      cancelButtonText: 'Cancel',
    });
    if (!isConfirmed) return;

    try {
      await rejectRemovalRequest(req.id, note || null);
      load();
    } catch (err) {
      await Swal.fire({
        title: 'Error',
        text: err.response?.data?.message ?? 'Failed to reject removal request.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  return (
    <div className={detailStyles.page}>
      <h1 className={detailStyles.heading} style={{ marginBottom: 0 }}>
        Removal Requests
      </h1>

      {/* ── Status filter tabs ── */}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            style={{
              background: statusFilter === tab ? '#4f46e5' : 'transparent',
              border: `1px solid ${statusFilter === tab ? '#4f46e5' : '#d1d5db'}`,
              borderRadius: '6px',
              color: statusFilter === tab ? '#fff' : '#374151',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 500,
              padding: '0.3rem 0.9rem',
              transition: 'background 0.12s, border-color 0.12s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── States ── */}
      {loading && <p className={detailStyles.stateMsg}>Loading…</p>}
      {!loading && error && <p className={detailStyles.error}>{error}</p>}
      {!loading && !error && requests.length === 0 && (
        <p className={detailStyles.stateMsg}>
          No {statusFilter !== 'All' ? statusFilter.toLowerCase() + ' ' : ''}removal requests.
        </p>
      )}

      {/* ── Table ── */}
      {!loading && !error && requests.length > 0 && (
        <div className={listStyles.tableWrap}>
          <table className={listStyles.table}>
            <thead>
              <tr>
                <th>TIN</th>
                <th>Teacher</th>
                <th>Reason</th>
                <th>Requested by</th>
                <th>Requested at</th>
                <th>Status</th>
                <th>Resolved by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td className={listStyles.mono}>{req.teacher_tin ?? '—'}</td>
                  <td>{req.teacher_name ?? <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{REASON_LABELS[req.reason] ?? req.reason}</td>
                  <td>{req.requested_by_username ?? '—'}</td>
                  <td>{fmtDate(req.requested_at)}</td>
                  <td>
                    <StatusBadge status={req.status} />
                    {req.status === 'Rejected' && req.rejection_note && (
                      <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: '0.2rem 0 0' }}>
                        {req.rejection_note}
                      </p>
                    )}
                  </td>
                  <td>{req.approved_by_username ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {req.status === 'Pending' && (
                      <>
                        <button
                          className={detailStyles.removalBtn}
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem', marginRight: '0.3rem' }}
                          onClick={() => handleApprove(req)}
                        >
                          Approve
                        </button>
                        <button
                          className={detailStyles.editBtn}
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem', background: '#fff', borderColor: '#d1d5db', color: '#374151', marginRight: '0.3rem' }}
                          onClick={() => handleReject(req)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      className={detailStyles.backBtn}
                      style={{ fontSize: '0.78rem' }}
                      onClick={() => navigate(`/international/teachers/${req.teacher_id}`)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Pending:  { background: '#fef3c7', color: '#92400e' },
    Approved: { background: '#fee2e2', color: '#991b1b' },
    Rejected: { background: '#f1f5f9', color: '#374151' },
  };
  const s = map[status] ?? map.Rejected;
  return (
    <span style={{
      ...s,
      borderRadius: '999px',
      display: 'inline-block',
      fontSize: '0.75rem',
      fontWeight: 600,
      padding: '0.2rem 0.65rem',
    }}>
      {status}
    </span>
  );
}
