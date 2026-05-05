import { createBrowserRouter, Navigate } from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";
import RoleGuard from "./RoleGuard";
import AppLayout from "../layout/AppLayout";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import TeacherListPage from "../pages/private/TeacherListPage";
import TeacherDetailPage from "../pages/private/TeacherDetailPage";
import TeacherFormPage from "../pages/private/TeacherFormPage";

const router = createBrowserRouter([
  // ── Public ────────────────────────────────────────────────────────────────
  {
    path: "/login",
    element: <Login />,
  },

  // ── Authenticated ─────────────────────────────────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Default: redirect root to /dashboard
          { index: true, element: <Navigate to="/dashboard" replace /> },

          // Shared dashboard (all roles)
          { path: "dashboard", element: <Dashboard /> },

          // Private school admins
          {
            element: <RoleGuard roles={["admin_private"]} />,
            children: [
              { path: "private/teachers", element: <TeacherListPage /> },
              { path: "private/teachers/new", element: <TeacherFormPage /> },
              { path: "private/teachers/:id", element: <TeacherDetailPage /> },
              {
                path: "private/teachers/:id/edit",
                element: <TeacherFormPage />,
              },
            ],
          },

          // International school admins
          {
            element: <RoleGuard roles={["admin_international"]} />,
            children: [
              { path: "international/teachers", element: <Dashboard /> },
            ],
          },

          // Vested school admins
          {
            element: <RoleGuard roles={["admin_vested"]} />,
            children: [{ path: "vested/schools", element: <Dashboard /> }],
          },

          // Principal / Head of HR — own school only, view-only
          {
            element: <RoleGuard roles={["principal", "head_of_hr"]} />,
            children: [
              { path: "my-school/teachers",      element: <TeacherListPage /> },
              { path: "my-school/teachers/:id",  element: <TeacherDetailPage /> },
            ],
          },

          // Catch-all inside auth — back to dashboard
          { path: "*", element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);

export default router;
