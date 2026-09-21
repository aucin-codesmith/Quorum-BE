import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import env from "../config/env.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { AppError, forbidden, unauthorized } from "../utils/AppError.js";

// Verifies the Bearer JWT, then loads the user so deactivation and role changes take effect immediately.
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw unauthorized("Missing or malformed Authorization header. Use: Bearer <token>");
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") throw unauthorized("Token has expired", "TOKEN_EXPIRED");
    throw unauthorized("Invalid token", "INVALID_TOKEN");
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user) throw unauthorized("The account for this token no longer exists", "INVALID_TOKEN");
  if (user.status !== "active") {
    throw new AppError(403, "ACCOUNT_INACTIVE", "This account is inactive");
  }

  req.user = user;
  next();
}

// Use after authenticate: authorize("admin").
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user?.role)) throw forbidden();
    next();
  };
