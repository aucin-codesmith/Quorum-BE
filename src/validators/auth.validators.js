import { z } from "zod";
import { email, optionalText, password, text } from "./common.js";

export const registerBody = z.object({
  name: text("Name", 120).min(2, "Name must be at least 2 characters"),
  email,
  password,
  jobTitle: optionalText("Job title", 120).default(""),
  department: optionalText("Department", 120).default(""),
});

export const loginBody = z.object({
  email,
  // Not re-validated against the password policy: existing accounts must always be able to try.
  password: z.string("Password is required").min(1, "Password is required").max(200),
});
