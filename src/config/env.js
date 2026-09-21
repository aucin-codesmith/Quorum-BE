import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  // Comma-separated list of front-end origins allowed by CORS.
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:5199"),
  // "Today" and past-date checks use this zone rather than the server's.
  APP_TIMEZONE: z.string().default("Asia/Jakarta"),
  WORK_START: hhmm.default("08:00"),
  WORK_END: hhmm.default("18:00"),
  // Max login/register attempts per IP per 15 minutes. Generous for development; use ~10-20 in production.
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(100),
  // Number of reverse proxies in front of the API (so rate limiting sees the real client IP). 0 = none.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
  console.error(`Invalid environment configuration:\n${lines.join("\n")}`);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === "production" && /change-?me/i.test(env.JWT_SECRET)) {
  console.error("Refusing to start: set a real JWT_SECRET for production.");
  process.exit(1);
}

export default {
  ...env,
  isProduction: env.NODE_ENV === "production",
  corsOrigins: env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
};
