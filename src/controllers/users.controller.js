import bcrypt from "bcryptjs";
import { count, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import env from "../config/env.js";
import { db } from "../db/index.js";
import { reservations, users } from "../db/schema.js";
import { forbidden, notFound } from "../utils/AppError.js";
import { offsetOf } from "../utils/pagination.js";
import { allOf, contains, orderBy, pageMeta } from "../utils/query.js";
import { created, noContent, ok } from "../utils/response.js";
import { serializeUser } from "../utils/serializers.js";

const upcomingReservations = sql`(
  select count(*)::int from ${reservations}
  where ${reservations.userId} = ${users.id} and ${reservations.status} = 'upcoming'
)`
  .mapWith(Number)
  .as("upcoming_reservations");

const withCount = () => db.select({ ...getTableColumns(users), upcomingReservations }).from(users);

const SORT_COLUMNS = {
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
};

// GET /api/users: admin
export async function listUsers(req, res) {
  const query = req.validated.query;
  const where = allOf(
    query.q && or(ilike(users.name, contains(query.q)), ilike(users.email, contains(query.q)), ilike(users.department, contains(query.q))),
    query.role && eq(users.role, query.role),
    query.status && eq(users.status, query.status)
  );

  const [rows, [{ total }]] = await Promise.all([
    withCount()
      .where(where)
      .orderBy(...orderBy(query.sort, SORT_COLUMNS, users.id))
      .limit(query.limit)
      .offset(offsetOf(query)),
    db.select({ total: count() }).from(users).where(where),
  ]);

  ok(res, rows.map(serializeUser), pageMeta(query, total));
}

// GET /api/users/:id: admin
export async function getUser(req, res) {
  const [user] = await withCount().where(eq(users.id, req.validated.params.id)).limit(1);
  if (!user) throw notFound("User");
  ok(res, serializeUser(user));
}

// POST /api/users: admin creates an account with any role
export async function createUser(req, res) {
  const { password, ...rest } = req.validated.body;
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const [user] = await db.insert(users).values({ ...rest, passwordHash }).returning();
  created(res, serializeUser(user));
}

// PUT /api/users/:id: admin; omitted fields keep their value
export async function updateUser(req, res) {
  const { id } = req.validated.params;
  const { password, ...patch } = req.validated.body;

  const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!current) throw notFound("User");

  const changesOwnAccess =
    (patch.role !== undefined && patch.role !== current.role) ||
    (patch.status !== undefined && patch.status !== current.status);
  if (id === req.user.id && changesOwnAccess) {
    throw forbidden("You cannot change your own role or status");
  }

  const values = { ...patch };
  if (password) values.passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  const [user] = await db.update(users).set(values).where(eq(users.id, id)).returning();
  ok(res, serializeUser(user));
}

// DELETE /api/users/:id: admin. Refused (409) while reservations reference the user.
export async function deleteUser(req, res) {
  const { id } = req.validated.params;
  if (id === req.user.id) throw forbidden("You cannot delete your own account");

  const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  if (deleted.length === 0) throw notFound("User");
  noContent(res);
}
