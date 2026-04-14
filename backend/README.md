# Archbishop's House School Management System — Backend

REST API backend for the Archbishop's House Colombo school management system.
Manages teachers, principals, religious personnel, documents, and student statistics
across three school categories: **Private**, **International**, and **Vested**.

---

## Tech Stack

| Layer       | Technology                       |
| ----------- | -------------------------------- |
| Runtime     | Node.js (CommonJS)               |
| Framework   | Express 5                        |
| Database    | MySQL 8.0+ via `mysql2/promise`  |
| Auth        | JWT (`jsonwebtoken`) + bcrypt    |
| File upload | Multer (disk storage)            |
| Security    | Helmet, CORS, express-rate-limit |
| Logging     | Winston + Morgan                 |

---

## Getting Started

### 1. Prerequisites

- Node.js ≥ 18
- MySQL 8.0+
- Git

### 2. Clone and install

```bash
git clone <repo-url>
cd archbishops-house-school-mgt-system-backend
npm install
```

### 3. Configure environment

Copy the example below into a `.env` file in the project root:

```env
NODE_ENV=development
PORT=5000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=archbishops_school_mgt

JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d

LOG_LEVEL=info
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=10
```

### 4. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS archbishops_school_mgt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 5. Apply schema and migrations

```bash
mysql -u root -p archbishops_school_mgt < database/schema.sql

mysql -u root -p archbishops_school_mgt < database/migrations/001_add_profile_picture.sql
mysql -u root -p archbishops_school_mgt < database/migrations/002_add_tin_sequences.sql
mysql -u root -p archbishops_school_mgt < database/migrations/003_dashboard_indexes.sql
mysql -u root -p archbishops_school_mgt < database/migrations/004_documents_category.sql
mysql -u root -p archbishops_school_mgt < database/migrations/005_audit_logs.sql
```

### 6. Seed admin users

```bash
npm run seed
```

This creates one admin account per school type. Default password for all accounts is `ChangeMe123!` — **change these immediately in production.**

Override defaults via environment variables — see `database/seed_admin.js` for the variable names.

### 7. Import legacy data

Place the original Excel files under `database/CSV_files_of_the_current_system/` in the folder structure the scripts expect, then run the import modules **in this exact order** (each step depends on the previous):

```bash
# Schools must come first — all other modules resolve school IDs from this table
npm run import:schools

# Private school teachers (active)
npm run import:private

# Retired private school teachers (is_active = 0)
npm run import:retired

# International school teachers
npm run import:international

# Archdiocesan rectors
npm run import:rectors

# College fathers
npm run import:fathers

# Vested schools, principals, and student statistics
npm run import:vested
```

Each command runs in **live mode** — changes are committed. To validate without writing to the database, add `--dry-run`:

```bash
node database/import_xlsx.js --module private --dry-run
node database/import_xlsx.js --module private --dry-run --verbose  # prints every row
```

After a successful import the script automatically syncs `tin_sequences` so that the TIN allocation system picks up from where the imported data left off.

### 8. Start the server

```bash
npm run dev    # development (auto-restart on file change)
npm start      # production
```

The API is available at `http://localhost:5000`.

---

## Architecture

The backend is a **modular monolith**: one Express application, each feature module
owns its own routes → controller → service → repository chain.

```
src/
├── app.js                  Express app (middleware stack)
├── routes.js               Mounts all module routers under /api
├── config/
│   ├── env.js              Environment config
│   └── database.js         MySQL pool (connectDB / getPool)
├── shared/
│   ├── constants/roles.js  ROLES and ROLE_GROUPS constants
│   ├── middleware/
│   │   ├── authenticate.js  Verify Bearer JWT → attach req.user
│   │   ├── authorize.js     Role-based gate (factory: authorize(...roles))
│   │   ├── schoolFilter.js  Attach req.schoolFilter (null for admins,
│   │   │                    { school_id } for principal/HR)
│   │   ├── rateLimiter.js
│   │   ├── requestLogger.js
│   │   ├── notFound.js
│   │   └── errorHandler.js  Central error handler (AppError → HTTP response)
│   └── utils/
│       ├── AppError.js      Operational error class
│       ├── asyncHandler.js  Wraps async handlers, forwards rejections to next()
│       ├── response.js      sendSuccess / sendCreated / sendNoContent
│       └── logger.js        Winston logger
└── modules/
    ├── auth/               Login, JWT issue, token verify
    ├── teachers/           Private school teacher CRUD + removal workflow
    ├── schools/            School master list
    ├── tin/                TIN allocation, preview, lookup
    ├── documents/          Document upload / replace / download / delete
    ├── vested/             Vested school CRUD, principals, student stats
    ├── rectors/            Archdiocesan rector CRUD
    └── fathers/            College father CRUD
```

### Request lifecycle

Every protected route follows this middleware chain:

```
authenticate → authorize(ROLE_GROUPS.xxx) → [schoolFilter] → asyncHandler(ctrl.fn)
```

All unhandled errors bubble to the central `errorHandler` in `app.js`.

---

## Authentication

`POST /api/auth/login` — returns a signed JWT.

Include the token in every subsequent request:

```
Authorization: Bearer <token>
```

The decoded payload (`req.user`) carries:

```json
{
  "sub": 1,
  "username": "admin_private_1",
  "role": "admin_private",
  "school_type": "Private",
  "school_id": null
}
```

---

## Role-Based Access

| Role                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| `admin_private`       | Full CRUD on Private school teachers and data       |
| `admin_international` | Full CRUD on International school teachers and data |
| `admin_vested`        | Full CRUD on Vested school data                     |
| `principal`           | View-only, filtered to their assigned school        |
| `head_of_hr`          | View-only, filtered to their assigned school        |

`schoolFilter` middleware enforces the school boundary server-side — `principal` and `head_of_hr` users cannot override it via query params.

---

## API Reference

### Health

| Method | Path    | Auth | Description         |
| ------ | ------- | ---- | ------------------- |
| GET    | /health | No   | Server health check |

### Auth

| Method | Path            | Auth | Description    |
| ------ | --------------- | ---- | -------------- |
| POST   | /api/auth/login | No   | Login, get JWT |

### Teachers (Private Schools)

All routes require authentication. Write routes require `admin_private` or `admin_international`.

| Method | Path                                       | Roles | Description                        |
| ------ | ------------------------------------------ | ----- | ---------------------------------- |
| GET    | /api/teachers                              | All   | List teachers (paginated, filters) |
| POST   | /api/teachers                              | Admin | Create teacher                     |
| GET    | /api/teachers/:id                          | All   | Full teacher profile               |
| PATCH  | /api/teachers/:id                          | Admin | Update teacher                     |
| DELETE | /api/teachers/:id                          | Admin | Blocked — use removal workflow     |
| PUT    | /api/teachers/:id/profile-picture          | Admin | Upload profile picture             |
| POST   | /api/teachers/:id/removal-request          | Admin | Initiate dual-approval removal     |
| GET    | /api/teachers/removal-requests             | Admin | List removal requests              |
| POST   | /api/teachers/removal-requests/:id/approve | Admin | Second admin approves removal      |
| POST   | /api/teachers/removal-requests/:id/reject  | Admin | Reject removal request             |

**Pagination** (`GET /api/teachers`):

```
?page=1&limit=20&schoolId=5&name=Silva&tin=1%2F026&category=2
```

Response shape:

```json
{
  "data": {
    "items": [...],
    "pagination": { "total": 84, "page": 1, "limit": 20, "totalPages": 5 }
  }
}
```

### TIN

| Method | Path             | Roles | Description                      |
| ------ | ---------------- | ----- | -------------------------------- |
| GET    | /api/tin/preview | All   | Preview next TIN (non-reserving) |
| GET    | /api/tin/:tin    | All   | Lookup teacher by TIN            |

TIN format: `1/026/013/2524` — URL-encode slashes as `%2F`.

### Documents

| Method | Path                        | Roles | Description                          |
| ------ | --------------------------- | ----- | ------------------------------------ |
| GET    | /api/documents              | All   | List documents (admin-only filtered) |
| GET    | /api/documents/:id/download | All   | Download PDF                         |
| POST   | /api/documents              | Admin | Upload document (multipart)          |
| PATCH  | /api/documents/:id          | Admin | Replace file (versioning)            |
| DELETE | /api/documents/:id          | Admin | Delete document and file             |

Upload fields (`multipart/form-data`):

- `document` — PDF file (required)
- `doc_category` — `Teachers | Religious | Students | Principals | Non_academic`
- `form_code` — e.g. `ACPS_01`, `ACIS_03`
- `owner_type` — `Private | International | Father | Rector | Principal | Student | General`
- `owner_id` — entity ID (required when owner_type is set)
- `admin_only` — `0` or `1`

### Vested Schools

Write routes require `admin_vested`.

| Method | Path                                            | Roles        | Description                      |
| ------ | ----------------------------------------------- | ------------ | -------------------------------- |
| GET    | /api/vested/schools                             | All          | List schools (filter by zone)    |
| POST   | /api/vested/schools                             | admin_vested | Create school                    |
| GET    | /api/vested/schools/:id                         | All          | Full school + principals + stats |
| PATCH  | /api/vested/schools/:id                         | admin_vested | Update school                    |
| DELETE | /api/vested/schools/:id                         | admin_vested | Delete school                    |
| GET    | /api/vested/schools/:id/principals              | All          | Principal history                |
| POST   | /api/vested/schools/:id/principals              | admin_vested | Add principal                    |
| PATCH  | /api/vested/schools/:id/principals/:pid         | admin_vested | Update principal                 |
| POST   | /api/vested/schools/:id/principals/:pid/archive | admin_vested | Archive (keep history)           |
| GET    | /api/vested/schools/:id/stats                   | All          | All yearly student stats         |
| POST   | /api/vested/schools/:id/stats                   | admin_vested | Add / replace a year's stats     |
| PATCH  | /api/vested/schools/:id/stats/:year             | admin_vested | Update specific year             |
| DELETE | /api/vested/schools/:id/stats/:year             | admin_vested | Delete year stats                |

Vested school filters: `?zone=Colombo&district=Gampaha&principalReligion=Catholic`

### Rectors

Write routes require `admin_vested`.

| Method | Path              | Roles        | Description        |
| ------ | ----------------- | ------------ | ------------------ |
| GET    | /api/rectors      | All          | List rectors       |
| POST   | /api/rectors      | admin_vested | Create rector      |
| GET    | /api/rectors/:id  | All          | Rector detail      |
| PATCH  | /api/rectors/:id  | admin_vested | Update rector      |
| DELETE | /api/rectors/:id  | admin_vested | Delete rector      |

### Fathers

Write routes require `admin_vested`.

| Method | Path              | Roles        | Description        |
| ------ | ----------------- | ------------ | ------------------ |
| GET    | /api/fathers      | All          | List fathers       |
| POST   | /api/fathers      | admin_vested | Create father      |
| GET    | /api/fathers/:id  | All          | Father detail      |
| PATCH  | /api/fathers/:id  | admin_vested | Update father      |
| DELETE | /api/fathers/:id  | admin_vested | Delete father      |

---

## TIN System

Teacher Identification Numbers follow this format:

```
Category / SchoolNo(3-digit) / NoInSchool(3-digit) / GlobalNo
Example: 1/026/013/2524
```

| Category | Meaning               |
| -------- | --------------------- |
| 1        | Teacher (Pensionable) |
| 2        | Clerical Staff        |
| 3        | Minor Staff           |

| School range | Type          |
| ------------ | ------------- |
| 01 – 32      | Private       |
| 51 – 55      | International |

**Concurrency**: TIN allocation uses `SELECT ... FOR UPDATE` on the `tin_sequences` table inside the teacher-creation transaction. Vacant rows (soft-deleted teachers) are reused first before incrementing the global counter.

---

## Teacher Removal Workflow (Dual-Admin Approval)

Direct deletion is blocked. Removal requires two distinct admins:

1. **Admin A** — `POST /api/teachers/:id/removal-request` with a `reason`
2. **Admin B** (different user) — `POST /api/teachers/removal-requests/:id/approve`

On approval the teacher row is soft-deleted: all personal data is cleared but TIN components are preserved for potential reuse.

---

## Computed Fields

These values are never stored — calculated at query time:

| Field           | Formula                                                     |
| --------------- | ----------------------------------------------------------- |
| Age             | `TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE())`             |
| Retirement date | `DATE_ADD(date_of_birth, INTERVAL 60 YEAR)`                 |
| Service years   | `TIMESTAMPDIFF(YEAR, date_of_first_appointment, CURDATE())` |
| Catholic %      | `count_catholic / NULLIF(total_students,0) * 100`           |

---

## File Storage

Uploaded files are written to `<UPLOAD_DIR>/` (default `uploads/`):

```
uploads/
├── profile-pictures/   Teacher profile photos (JPEG/PNG/WebP)
└── documents/          ACPS / ACIS PDF forms
```

`stored_path` in the `documents` table is relative to `UPLOAD_DIR`. The server resolves the absolute path on download.
