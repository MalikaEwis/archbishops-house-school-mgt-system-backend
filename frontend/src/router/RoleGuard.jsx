import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, getRoleHome } from '../auth/AuthContext';

/**
 * Restricts a route (or subtree) to specific roles.
 *
 * Usage in the router:
 *   <Route element={<RoleGuard roles={['admin_private', 'admin_international']} />}>
 *     <Route path="/private/teachers" element={<TeachersPage />} />
 *   </Route>
 *
 * If the user's role is not in `roles`, they are redirected to their own
 * home route (getRoleHome) rather than a generic 403 page — keeps UX clean.
 */
export default function RoleGuard({ roles }) {
  const { user } = useAuth();

  if (!roles.includes(user?.role)) {
    return <Navigate to={getRoleHome(user?.role)} replace />;
  }

  return <Outlet />;
}
