import { rateLimit } from "express-rate-limit";
import env from "../config/env.js";
import { AppError } from "../utils/AppError.js";

// Slows credential stuffing on login/register. Errors go through the central handler for a uniform shape.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Too many attempts. Try again in a few minutes.")),
});
