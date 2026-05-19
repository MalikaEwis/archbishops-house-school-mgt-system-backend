# Archbishop's House School Management System

![Node.js](https://img.shields.io/badge/Node.js-Express_5-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue?style=flat-square)

A production-grade school management system commissioned by **Archbishop's House, Colombo** to digitise and centralise the administration of all Catholic schools under the Archdiocese. The system manages teacher records, personnel files, school details, and controlled data workflows across three distinct school categories — Private, International, and Vested — with strict, role-based access at every layer.

---

## Table of Contents

1. [Modules](#modules)
2. [System Capabilities](#system-capabilities)
3. [Tech Stack](#tech-stack)
4. [Architecture](#architecture)
5. [Folder Structure](#folder-structure)
6. [Setup](#setup)
7. [Environment Variables](#environment-variables)
8. [Database Setup](#database-setup)
9. [Import / Reset System](#import--reset-system)
10. [Security & Access Control](#security--access-control)
11. [API Overview](#api-overview)
12. [Future Enhancements](#future-enhancements)
13. [Screenshots](#screenshots)
14. [Developed By](#developed-by-E-WIS-Solutions)

---

## Modules

### Catholic Private Schools

Manages all 32 archdiocesan private schools (school index range `01–32`). Covers the full teacher lifecycle from onboarding to removal, with detailed personal, employment, and qualification records. Also manages **Rectors** and **College Fathers** who are assigned across private schools.

**Entities:** Teachers · Rectors · Fathers · Removal Requests · Documents

### Catholic International Schools

Manages 5 international schools (school index range `51–55`). Teachers have a distinct employment category structure (Permanent / Fixed Term Contract), and the module supports its own removal request workflow, contract tracking, and document management.

**Entities:** Teachers · Removal Requests · Documents

### Catholic Vested Schools

A school-centric module for schools that have been vested to the Archdiocese. Each school has an extended profile covering geographic, administrative, and canonical data. The module tracks current and former principals with archival history, yearly student statistics with religion and medium breakdowns, and Bishop Oswald Gomis target percentages for student religion ratios.

**Entities:** Vested Schools · Principals (current + archived) · Student Statistics

---

## System Capabilities

| Capability                       | Detail                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| **Role-Based Access Control**    | Five roles with granular route-level and data-level enforcement                        |
| **TIN Allocation System**        | Concurrency-safe Teacher Identification Number generation with slot reuse              |
| **Dual-Admin Removal Workflow**  | Two separate admins must authorise any teacher removal; cross-admin, cross-session     |
| **XLSX / CSV Migration**         | In-browser atomic reset-and-reimport from official spreadsheet exports                 |
| **Placeholder TIN Preservation** | Blank legacy rows are stored as vacant slots; TIN sequence continuity is maintained    |
| **Profile Picture Management**   | Upload and remove profile photos per teacher; stored on disk under a configurable path |
| **Document Management**          | PDF upload, replacement, and download per teacher; admin-only document flag supported  |
| **Advanced Filtering & Search**  | Server-side filtering by school, category, status, name, TIN, NIC, and more            |
| **Pagination**                   | Cursor-free offset pagination on all list endpoints                                    |
| **Retirement Calculations**      | Age and retirement date computed in the database from date of birth                    |
| **Service Length Calculation**   | Present service (years + months) computed from date of first appointment               |
| **Student Statistics**           | Yearly per-school breakdown by religion and teaching medium                            |
| **School Filter Middleware**     | Principals and HR officers are automatically scoped to their own school                |
| **Audit Logging**                | Structural audit log table for tracking sensitive operations                           |
| **Rate Limiting**                | Per-IP request throttling on all API routes                                            |
| **Request Logging**              | HTTP request logging via Morgan + Winston                                              |
| **Soft Delete**                  | Teacher TINs are never deleted; only personal data is cleared on removal               |

---

## Tech Stack

### Backend

| Layer               | Technology                     |
| ------------------- | ------------------------------ |
| Runtime             | Node.js                        |
| Framework           | Express 5                      |
| Database driver     | mysql2 / promise               |
| Authentication      | jsonwebtoken + bcryptjs        |
| File uploads        | Multer (disk + memory storage) |
| Spreadsheet parsing | xlsx                           |
| Security headers    | Helmet                         |
| Rate limiting       | express-rate-limit             |
| Logging             | Winston + Morgan               |
| Process management  | Nodemon (development)          |

### Frontend

| Layer            | Technology         |
| ---------------- | ------------------ |
| UI library       | React 19           |
| Routing          | React Router DOM 7 |
| HTTP client      | Axios              |
| Dialogs & alerts | SweetAlert2        |
| Styling          | CSS Modules        |
| Build tool       | Vite 8             |

### Database

- **MySQL 8.0+** — InnoDB engine, utf8mb4 collation throughout
- Stored `tin` column generated by MySQL (`GENERATED ALWAYS AS ... STORED`) for zero-cost TIN formatting
- Indexed on all frequently filtered columns (school, status, TIN components, NIC)

---

## Architecture

The backend follows a **modular monolith** pattern. Each feature domain is a self-contained module:

```
request → authenticate → authorize → schoolFilter → asyncHandler → controller → service → repository → MySQL
```

- **`authenticate`** — validates Bearer JWT, attaches `req.user` (sub, username, role, school_type, school_id)
- **`authorize(...roles)`** — rejects roles not in the allowed list
- **`schoolFilter`** — sets `req.schoolFilter`: `null` for admin roles, `{ school_id }` for principals/HR; services always consume this, never raw query params
- **`asyncHandler`** — wraps async controller functions so thrown errors propagate to the central error handler
- **`AppError`** — operational errors with an HTTP status code; anything else becomes a 500

The frontend is a single-page application with React Router's data router. Route-level `RoleGuard` components prevent navigation to routes outside a user's role before the API is even called.

---

## Folder Structure

```
archbishops-house-school-mgt-system/
├── backend/
│   ├── database/
│   │   ├── schema.sql                  # Full MySQL schema (run first)
│   │   ├── migrations/                 # Numbered incremental migrations
│   │   ├── seed_admin.js               # Seeds the initial admin user
│   │   └── import_xlsx.js              # CLI bulk importer (initial data load)
│   └── src/
│       ├── app.js                      # Express app assembly
│       ├── routes.js                   # All module routers mounted here
│       ├── config/
│       │   ├── database.js             # MySQL pool, connectDB(), getPool()
│       │   └── env.js                  # Validated environment config
│       ├── modules/
│       │   ├── auth/                   # Login, JWT issue
│       │   ├── admin/                  # Reset-and-reimport endpoints
│       │   ├── teachers/               # Private school teachers + removal workflow
│       │   ├── international/          # International school teachers + removal workflow
│       │   ├── vested/                 # Vested schools, principals, student stats
│       │   ├── schools/                # School master list
│       │   ├── rectors/                # Archdiocesan rectors
│       │   ├── fathers/                # College fathers
│       │   ├── documents/              # PDF document management
│       │   └── tin/                    # TIN allocation service
│       └── shared/
│           ├── constants/roles.js      # ROLES and ROLE_GROUPS constants
│           ├── middleware/             # authenticate, authorize, schoolFilter, etc.
│           └── utils/                  # AppError, asyncHandler, response helpers, logger
└── frontend/
    └── src/
        ├── api/                        # Axios API clients per module
        ├── auth/                       # AuthContext, JWT decode
        ├── components/                 # Shared UI components (ProfilePicture, Pagination)
        ├── layout/                     # AppLayout, Sidebar, Topbar
        ├── pages/
        │   ├── private/                # Private school pages
        │   ├── international/          # International school pages
        │   └── vested/                 # Vested school pages
        └── router/                     # React Router config, ProtectedRoute, RoleGuard
```

Each module follows a strict four-file structure: `routes.js → controller.js → service.js → repository.js`.

---

## Setup

### Prerequisites

- Node.js 18+
- MySQL 8.0+

### Backend

```bash
cd backend
npm install
cp .env.example .env        # fill in your values (see below)
npm run dev                 # starts on PORT (default 5000) with nodemon
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # starts Vite dev server (default port 5173)
```

---

## Environment Variables

Create `backend/.env` with the following:

```env
NODE_ENV=development
PORT=

DB_HOST=localhost
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=archbishops_school_mgt

JWT_SECRET=changeme_use_a_long_random_string
JWT_EXPIRES_IN=1d

LOG_LEVEL=info
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=10
```

---

## Database Setup

Run these steps in order:

```bash
# 1. Create and populate all tables
mysql -u root -p archbishops_school_mgt < backend/database/schema.sql

# 2. Apply migrations in numbered order
mysql -u root -p archbishops_school_mgt < backend/database/migrations/001_add_profile_picture.sql
mysql -u root -p archbishops_school_mgt < backend/database/migrations/002_add_tin_sequences.sql
mysql -u root -p archbishops_school_mgt < backend/database/migrations/003_dashboard_indexes.sql
mysql -u root -p archbishops_school_mgt < backend/database/migrations/004_documents_category.sql
mysql -u root -p archbishops_school_mgt < backend/database/migrations/005_audit_logs.sql
mysql -u root -p archbishops_school_mgt < backend/database/migrations/006_international_satellite_tables.sql

# 3. Seed the initial admin user
cd backend && npm run seed

# 4. (Optional) Bulk-import from official XLSX spreadsheets
npm run import:schools
npm run import:private
npm run import:retired
npm run import:international
npm run import:rectors
npm run import:fathers
npm run import:vested
```

---

## Import / Reset System

Administrators can upload the official XLSX spreadsheet exports directly through the web UI. The system performs an **atomic reset-and-reimport** inside a single database transaction:

1. All satellite records are deleted (phones, contracts, mediums, class levels, education, qualifications, subjects)
2. All teacher records are deleted
3. TIN sequences are reset to zero
4. The uploaded XLSX is parsed in memory (no temp files)
5. Every row is re-inserted with fresh TIN allocation
6. The transaction commits on full success or rolls back entirely on any error

**Placeholder TIN slots** — legacy spreadsheets contain blank rows where a TIN is recorded but no teacher is assigned (vacated positions). These rows are preserved as `VACANT` sentinel records (`full_name = '__VACANT__'`) so TIN sequence continuity is not broken. They are excluded from all list and search views.

After every import, the UI displays a structured summary:

| Section      | Contents                                                        |
| ------------ | --------------------------------------------------------------- |
| Inserted     | Count of active teacher records created                         |
| Placeholders | Sheet name, row number, TIN, school, generated placeholder NIC  |
| Skipped      | Sheet name, row number, teacher name, school, exact skip reason |
| Errors       | Sheet name, row number, error message                           |

This workflow is role-scoped: `admin_private` resets private + retired data; `admin_international` resets international data.

---

## Security & Access Control

### Roles

| Role                  | Scope                     | Permissions                                                     |
| --------------------- | ------------------------- | --------------------------------------------------------------- |
| `admin_private`       | All private schools       | Full CRUD — teachers, rectors, fathers, documents, import/reset |
| `admin_international` | All international schools | Full CRUD — teachers, documents, import/reset                   |
| `admin_vested`        | All vested schools        | Full CRUD — schools, principals, student stats                  |
| `principal`           | Own school only           | View-only — teachers at their assigned school                   |
| `head_of_hr`          | Own school only           | View-only — teachers at their assigned school                   |

### Dual-Admin Teacher Removal

Teacher removal is a two-step, two-person workflow:

1. **Admin A** initiates a removal request, selecting a reason (Resignation / Retirement / Transfer / Qualification Failure)
2. **Admin B** (a different admin) reviews and approves or rejects the request
3. On approval, all personal data fields are cleared (`NULL`), `is_active` is set to `0`, and `removed_at` is recorded
4. The TIN is **never deleted** — the row remains to preserve the allocation sequence

Admin A cannot approve their own request. The approval table (`teacher_removal_approvals`) is shared across Private and International types using a `teacher_type` discriminator column.

### Additional Security Measures

- All API routes protected by Bearer JWT (`jsonwebtoken`)
- Passwords hashed with `bcryptjs`
- Security headers applied via `Helmet`
- Per-IP rate limiting via `express-rate-limit`
- School-scoped data isolation enforced in middleware, not client-supplied params
- Admin-only document flag prevents non-admin roles from downloading restricted files

---

## API Overview

All routes are prefixed with `/api`.

| Prefix                        | Module                                              |
| ----------------------------- | --------------------------------------------------- |
| `/api/auth`                   | Login, session                                      |
| `/api/teachers`               | Private school teachers + removal workflow          |
| `/api/international-teachers` | International school teachers + removal workflow    |
| `/api/schools`                | School master list                                  |
| `/api/vested`                 | Vested schools, principals, student stats           |
| `/api/rectors`                | Archdiocesan rectors                                |
| `/api/fathers`                | College fathers                                     |
| `/api/documents`              | PDF document upload, download, management           |
| `/api/tin`                    | TIN allocation utilities                            |
| `/api/admin`                  | Atomic reset-and-reimport (private + international) |

---

## Future Enhancements

- **Dashboard analytics** — charts and KPIs aggregated per school type and across the archdiocese
- **Dark mode** — CSS custom property architecture already in place for theming
- **Audit log viewer** — admin UI to browse the `audit_logs` table
- **Email notifications** — notify admins on pending removal requests
- **Export to Excel / PDF** — one-click teacher list exports per school or across all schools
- **Principal portal** — a self-service view for principals to update their own school's details
- **Advanced reporting** — retirement forecasting, service-length reports, religion-ratio tracking for vested schools
- **Automated testing** — Jest + Supertest integration test suite against a test database
- **Containerisation** — Docker Compose setup for one-command local environment

---

## Screenshots

> _Screenshots to be added after final UI polish._

| View                 | Description                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| Login                | Secure login page with role-based redirect                                |
| Teacher List         | Filterable, paginated teacher list with TIN and status                    |
| Teacher Detail       | Full teacher profile with documents, qualifications, and removal controls |
| Import / Reset       | XLSX upload with structured post-import summary report                    |
| Vested School Detail | Extended school profile with principal history and student stats          |
| Removal Requests     | Pending / Approved / Rejected removal request queue                       |

---

## Developed By E-WIS Solutions

**Backend & Frontend Developer**
Malika Degaldoruwa

---

_Archbishop's House School Management System — Archdiocese of Colombo_
