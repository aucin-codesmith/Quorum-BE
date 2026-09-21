import { z } from "zod";

export const idParams = z.object({ id: z.uuid("id must be a valid UUID") });

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected time as HH:MM (24h)");

export const isoDate = z.iso.date("Expected date as YYYY-MM-DD");

// Trimmed string that must not be empty.
export const text = (label, max) =>
  z
    .string(`${label} is required`)
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

export const optionalText = (label, max) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`);

export const email = z
  .string("Email is required")
  .trim()
  .toLowerCase()
  .max(255, "Email must be at most 255 characters")
  .pipe(z.email("Enter a valid email address"));

// bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated.
export const password = z
  .string("Password is required")
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

// Update payloads: every field optional, but at least one must be present.
export const atLeastOne = (schema) =>
  schema.refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });

export const sortQuery = (allowed, fallback) =>
  z
    .string()
    .default(fallback)
    .refine((v) => allowed.includes(v.replace(/^-/, "")), {
      message: `sort must be one of: ${allowed.join(", ")} (prefix with - for descending)`,
    });
