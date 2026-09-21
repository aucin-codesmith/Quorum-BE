import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import env from "../config/env.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { AppError, unauthorized } from "../utils/AppError.js";
import { created, ok } from "../utils/response.js";
import { serializeUser } from "../utils/serializers.js";

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("quorum-timing-guard", env.BCRYPT_ROUNDS);

const signToken = (user) =>
  jwt.sign({ role: user.role }, env.JWT_SECRET, { subject: user.id, expiresIn: env.JWT_EXPIRES_IN });

const session = (user) => ({
  token: signToken(user),
  tokenType: "Bearer",
  expiresIn: env.JWT_EXPIRES_IN,
  user: serializeUser(user),
});

// POST /api/auth/register: public sign-up. Always creates an employee; roles are granted by an admin.
export async function register(req, res) {
  const { name, email, password, jobTitle, department } = req.validated.body;
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  // A duplicate email surfaces as the users_email_unique violation and becomes a 409 in the error handler.
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash, jobTitle, department, role: "employee", status: "active" })
    .returning();

  created(res, session(user));
}

// POST /api/auth/login
export async function login(req, res) {
  const { email, password } = req.validated.body;
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches) throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  if (user.status !== "active") {
    throw new AppError(403, "ACCOUNT_INACTIVE", "This account is inactive. Ask an administrator to reactivate it.");
  }

  ok(res, session(user));
}

// GET /api/auth/me
export function me(req, res) {
  ok(res, serializeUser(req.user));
}
