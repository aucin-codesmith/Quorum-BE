# QUORUM API

REST API for **QUORUM**, the meeting room reservation system. It serves the
[Quorum-FE](../Quorum-FE) front end: authentication, rooms, users and
reservations, with an administrator area for managing and monitoring them.

## Stack

| Concern | Choice |
|---|---|
| Runtime / framework | Node.js 22, Express 5 (JavaScript, ES Modules) |
| Database / ORM | PostgreSQL 16, Drizzle ORM + Drizzle Kit (SQL migrations) |
| Auth | JWT (`jsonwebtoken`), passwords hashed with `bcryptjs` |
| Validation | `zod` (body, params and query, before anything reaches the database) |
| Security | `helmet`, CORS allow-list, rate limiting on login/register |
| Packaging | Docker + Docker Compose (API + PostgreSQL) |

## Run it

### With Docker (recommended)

```bash
docker compose up --build
```

That starts PostgreSQL and the API, applies the migrations, and seeds demo
data. No `.env` file is needed; every value has a development default.

- API: http://localhost:3000 (health check: `/health`)
- PostgreSQL: `localhost:5433` (user `quorum`, password `quorum_dev_password`, db `quorum`)

Demo accounts, all with password `Password123!`:

| Email | Role |
|---|---|
| `admin@company.com` | administrator |
| `hendra.kusuma@company.com` | administrator |
| `alya.ramadhani@company.com` | employee |
| `farhan.malik@company.com` | employee (inactive, cannot sign in) |

Stop with `docker compose down`; add `-v` to also delete the database volume.

### Without Docker for the API

```bash
docker compose up -d db          # or point DATABASE_URL at your own PostgreSQL
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed                  # optional demo data
npm run dev
```

## Project structure

```
src/
├── config/          env.js (validated environment), constants.js (enums, facilities)
├── db/              schema.js (Drizzle tables), index.js (pool), migrate.js, seed.js
├── controllers/     business logic and response shaping, one file per resource
├── routes/          URLs, HTTP methods and middleware per resource
├── middlewares/     auth (JWT + roles), validate, errorHandler, rateLimit
├── validators/      zod schemas
├── utils/           AppError, pagination, serializers, dates
├── app.js           Express app (security, CORS, routes, error handling)
└── server.js        listen + graceful shutdown
drizzle/             generated SQL migrations (+ one hand-written)
postman/             Postman collection and environment
tests/               integration tests
```

## API overview

Base URL `http://localhost:3000`. Full request/response documentation, with
tests, is in the Postman collection (see below).

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Sign up (always an employee) |
| POST | `/api/auth/login` | public | Get a JWT |
| GET | `/api/auth/me` | signed in | Current user |
| GET | `/api/rooms` | signed in | List, filter, sort, paginate |
| GET | `/api/rooms/:id` | signed in | One room |
| GET | `/api/rooms/:id/schedule?date=` | signed in | Booked slots for a day |
| POST / PUT / DELETE | `/api/rooms[/:id]` | admin | Manage rooms |
| GET | `/api/facilities` | signed in | Facility catalogue |
| GET / POST | `/api/reservations` | signed in | List (own; admin: all) / book |
| GET / PUT | `/api/reservations/:id` | owner or admin | Read / edit / cancel |
| DELETE | `/api/reservations/:id` | admin | Delete the record |
| GET / POST | `/api/users` | admin | List / create |
| GET / PUT / DELETE | `/api/users/:id` | admin | Read / update / delete |
| GET | `/api/stats/overview` | admin | Monitoring counts and room utilisation |
| GET | `/health` | public | Liveness + database check |

Private endpoints need `Authorization: Bearer <token>`.

### Response format

Success: `{ "data": ... }`, and lists add `{ "meta": { "page", "limit", "total", "totalPages" } }`.
Deleting returns `204 No Content`.

Every error has the same shape, so the front end can handle them in one place:

```json
{
  "error": {
    "status": 409,
    "code": "RESERVATION_CONFLICT",
    "message": "Harbor is already booked from 10:00 to 11:00",
    "details": { "conflictingReservation": { "id": "…", "title": "…", "startTime": "10:00", "endTime": "11:00" } }
  }
}
```

Branch on `code`, display `message`. Validation errors (`400 VALIDATION_ERROR`)
carry `details: [{ location, field, message }]`, one entry per failed rule.

| Status | Meaning |
|---|---|
| 200 / 201 / 204 | OK / created / deleted |
| 400 | Invalid input (`VALIDATION_ERROR`, `INVALID_JSON`) |
| 401 | Missing, invalid or expired token; wrong credentials |
| 403 | Signed in but not allowed (role, own account, inactive account) |
| 404 | Not found (also used when a resource belongs to someone else) |
| 409 | Conflict: duplicate email or room name, overlapping booking, room not bookable, delete blocked |
| 429 | Too many login/register attempts |
| 500 | Unexpected error (details are hidden in production) |

## Business rules

- **Roles.** Employees manage their own reservations. Administrators manage
  everything. Public registration always creates an employee; only an admin can
  create administrators or change roles.
- **No double booking.** Two non-cancelled reservations of the same room cannot
  overlap (10:00-11:00 and 11:00-12:00 are fine). The API checks first, to
  return a helpful `409` that names the clash, and a PostgreSQL **exclusion
  constraint** enforces it even if two requests race.
- **A reservation must** be in a room that is `available`, fit the room's
  capacity, fall within working hours (default 08:00-18:00) and not be in the
  past (in `APP_TIMEZONE`).
- **Status changes.** An owner or admin can cancel an upcoming reservation;
  only an admin can mark it completed. Finished reservations are locked.
- **Deleting.** A room or user with reservations on record cannot be deleted
  (`409`): set the room to `maintenance` or deactivate the user instead. An
  admin cannot change or delete their own role, status or account.
- **Deactivating a user** takes effect immediately, even for a token that has
  not expired: the user is re-checked on every request.
- **Passwords** are hashed with bcrypt, must be 8-72 characters and contain a
  letter and a number, and are never returned by the API.

## Postman

Import both files from [`postman/`](postman):

- `Quorum-API.postman_collection.json`: every endpoint, with descriptions of
  the rules and error codes, and tests on each request
- `Quorum-Local.postman_environment.json`: `baseUrl` = `http://localhost:3000`

Run **Auth → Login (admin)** and **Login (employee)** once; tokens are stored
in collection variables and used by the other requests. The whole collection
also runs top to bottom in the Runner and cleans up after itself:

```bash
npx newman run postman/Quorum-API.postman_collection.json -e postman/Quorum-Local.postman_environment.json
```

## Tests

Integration tests hit a running API with the demo seed loaded:

```bash
docker compose up -d --build
npm test                      # BASE_URL=http://host:port to target another API
```

They cover authentication, role checks, validation, duplicate handling,
booking conflicts (including concurrent requests), status rules, CORS and
monitoring, and remove what they create.

## Configuration

Copy `.env.example` to `.env`. Docker Compose reads the same variables.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | none | required outside Docker |
| `JWT_SECRET` | none | required, at least 16 chars. **Set a real one in production** |
| `JWT_EXPIRES_IN` | `1d` | e.g. `15m`, `7d` |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:5199` | comma-separated front-end origins |
| `APP_TIMEZONE` | `Asia/Jakarta` | used for "today" and past-date checks |
| `WORK_START` / `WORK_END` | `08:00` / `18:00` | bookable hours |
| `AUTH_RATE_LIMIT` | `100` | login/register attempts per IP per 15 min; use 10-20 in production |
| `TRUST_PROXY` | `0` | number of reverse proxies in front of the API |
| `BCRYPT_ROUNDS` | `10` | |
| `SEED_ON_START` | `true` in compose | seeds demo data if the database has no users |

### Deploying for real

Set `NODE_ENV=production`, a strong `JWT_SECRET` (`openssl rand -hex 32`),
`SEED_ON_START=false`, a real database password, your front end's origin in
`CORS_ORIGIN`, and a low `AUTH_RATE_LIMIT`. The API refuses to start in
production with the placeholder secret.

## Database migrations

```bash
# after editing src/db/schema.js
npm run db:generate      # writes a new SQL file to drizzle/
npm run db:migrate       # applies pending migrations (the container does this on start)
```

`drizzle/0001_reservation_no_overlap.sql` is hand-written (the exclusion
constraint cannot be expressed in the Drizzle schema); keep it when
regenerating.

## Connecting the front end

The prototype currently keeps its data in memory. To switch it over:

1. Call `POST /api/auth/login` and send the token as `Authorization: Bearer …`.
2. Replace the in-memory stores (`useRooms`, `useUsers`, `useReservations`,
   `useAuth`) with API calls; the mutation names already match the endpoints.
3. Ids are UUIDs (the prototype used `r-01`-style strings). A reservation
   returns nested `room` and `user` objects instead of `roomName` / `userName`,
   and times are `HH:MM`.
4. Make sure the front end's origin is in `CORS_ORIGIN`.
