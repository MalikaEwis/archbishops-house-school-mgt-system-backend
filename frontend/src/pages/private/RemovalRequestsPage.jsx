import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  fetchRemovalRequests,
  approveRemovalRequest,
  rejectRemovalRequest,
} from '../../api/teachers';
import StatusBadge from '../../components/StatusBadge';
import detailStyles from './TeacherDetailPage.module.css';
import listStyles from './TeacherListPage.module.css';
import pageStyles from './RemovalRequestsPage.module.css';

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

export default function RemovalRequestsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = statusFilter !== 'All' ? { status: statusFilter } : {};
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
      confirmButtonColor: '#923328',
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
        confirmButtonColor: '#3B6355',
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
      confirmButtonColor: '#3B6355',
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
        confirmButtonColor: '#3B6355',
      });
    }
  }

  return (
    <div className={detailStyles.page}>
      {/* ── Title ── */}
      <h1 className={detailStyles.heading}>Removal Requests</h1>

      {/* ── Status filter tabs ── */}
      <div className={pageStyles.tabs}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`${pageStyles.tab} ${statusFilter === tab ? pageStyles.tabActive : ''}`}
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
                  <td>{req.teacher_name ?? <span className={detailStyles.nil}>—</span>}</td>
                  <td>{REASON_LABELS[req.reason] ?? req.reason}</td>
                  <td>{req.requested_by_username ?? '—'}</td>
                  <td>{fmtDate(req.requested_at)}</td>
                  <td>
                    <StatusBadge status={req.status} />
                    {req.status === 'Rejected' && req.rejection_note && (
                      <p className={pageStyles.rejectionNote}>
                        {req.rejection_note}
                      </p>
                    )}
                  </td>
                  <td>{req.approved_by_username ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {req.status === 'Pending' && (
                      <>
                        <button
                          className={pageStyles.approveBtn}
                          onClick={() => handleApprove(req)}
                        >
                          Approve
                        </button>
                        <button
                          className={pageStyles.rejectBtn}
                          onClick={() => handleReject(req)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      className={listStyles.viewBtn}
                      onClick={() => navigate(`/private/teachers/${req.teacher_id}`)}
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
