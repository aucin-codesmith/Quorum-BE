import { z } from "zod";
import { USER_ROLES, USER_STATUSES } from "../config/constants.js";
import { paginationQuery } from "../utils/pagination.js";
import { atLeastOne, email, optionalText, password, sortQuery, text } from "./common.js";

const SORTABLE = ["name", "email", "role", "status", "createdAt"];

export const listUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  sort: sortQuery(SORTABLE, "name"),
  ...paginationQuery,
});

export const createUserBody = z.object({
  name: text("Name", 120).min(2, "Name must be at least 2 characters"),
  email,
  password,
  jobTitle: optionalText("Job title", 120).default(""),
  department: optionalText("Department", 120).default(""),
  role: z.enum(USER_ROLES).default("employee"),
  status: z.enum(USER_STATUSES).default("active"),
});

// PUT: fields left out keep their current value.
export const updateUserBody = atLeastOne(
  z.object({
    name: text("Name", 120).min(2, "Name must be at least 2 characters").optional(),
    email: email.optional(),
    password: password.optional(),
    jobTitle: optionalText("Job title", 120).optional(),
    department: optionalText("Department", 120).optional(),
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
);
export { SORTABLE as USER_SORTABLE };
