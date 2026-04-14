import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Wraps all routes that require authentication.
 * - While auth state is initialising: show a blank screen (avoids flash-to-login).
 * - If no user: redirect to /login, preserving the attempted URL so we can
 *   send them back after a successful login.
 * - If authenticated: render child routes via <Outlet />.
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
