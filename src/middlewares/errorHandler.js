import { AppError } from "../utils/AppError.js";
import env from "../config/env.js";

// PostgreSQL error → friendly response, keyed by constraint name.
const CONSTRAINTS = {
  users_email_unique: { status: 409, code: "EMAIL_TAKEN", message: "Email is already registered", field: "email" },
  rooms_name_unique: { status: 409, code: "ROOM_NAME_TAKEN", message: "A room with this name already exists", field: "name" },
  reservations_no_overlap: {
    status: 409,
    code: "RESERVATION_CONFLICT",
    message: "The room is already booked for an overlapping time",
  },
  reservations_room_id_rooms_id_fk: {
    status: 409,
    code: "ROOM_HAS_RESERVATIONS",
    message: "This room has reservations on record. Set it to maintenance instead of deleting it.",
  },
  reservations_user_id_users_id_fk: {
    status: 409,
    code: "USER_HAS_RESERVATIONS",
    message: "This user has reservations on record. Deactivate the account instead of deleting it.",
  },
};

// Drizzle wraps driver errors in DrizzleQueryError (cause = the pg error); older versions throw the pg error itself.
const pgError = (err) => (err?.cause?.code ? err.cause : err);

function fromPostgres(err) {
  const pg = pgError(err);
  if (typeof pg?.code !== "string") return null;

  const known = CONSTRAINTS[pg.constraint];
  if (known) {
    return new AppError(known.status, known.code, known.message, known.field ? { field: known.field } : undefined);
  }
  switch (pg.code) {
    case "23505":
      return new AppError(409, "DUPLICATE_ENTRY", "A record with these values already exists");
    case "23P01":
      return new AppError(409, "RESERVATION_CONFLICT", "The room is already booked for an overlapping time");
    case "23503":
      return new AppError(409, "REFERENCE_CONSTRAINT", "The record is referenced by, or references, another record");
    case "23514":
      return new AppError(400, "CHECK_VIOLATION", "A value is outside the allowed range");
    case "22P02":
    case "22007":
    case "22008":
      return new AppError(400, "INVALID_INPUT", "A value has an invalid format");
    default:
      return null;
  }
}

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.originalUrl}`));
}

// One error shape for the whole API:
// { "error": { "status": 400, "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let error = err;

  if (!(error instanceof AppError)) {
    if (err?.type === "entity.parse.failed") {
      error = new AppError(400, "INVALID_JSON", "Request body is not valid JSON");
    } else if (err?.type === "entity.too.large") {
      error = new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    } else {
      error = fromPostgres(err) ?? error;
    }
  }

  if (!(error instanceof AppError)) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    error = new AppError(500, "INTERNAL_SERVER_ERROR", "Something went wrong on our side");
    // Never leak internals in production.
    if (!env.isProduction) error.details = { reason: err?.message };
  }

  res.status(error.status).json({
    error: {
      status: error.status,
      code: error.code,
      message: error.message,
      ...(error.details !== undefined && { details: error.details }),
    },
  });
}
