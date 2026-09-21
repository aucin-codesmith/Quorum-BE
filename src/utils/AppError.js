// Operational error carrying an HTTP status and a stable machine-readable code.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required", code = "UNAUTHORIZED") =>
  new AppError(401, code, message);
export const forbidden = (message = "You do not have permission to perform this action") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (resource = "Resource") => new AppError(404, "NOT_FOUND", `${resource} not found`);
export const conflict = (message, details, code = "CONFLICT") => new AppError(409, code, message, details);

// 400 shaped like the validate middleware's issues, for rules that need the database to check.
export const validationError = (field, message, location = "body") =>
  new AppError(400, "VALIDATION_ERROR", "Request validation failed", [{ location, field, message }]);
