import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

// validate({ body, params, query }) parses each part with its zod schema before the controller runs.
// Parsed (coerced, trimmed, defaulted) values land on req.validated; Express 5 makes req.query read-only.
export const validate = (schemas) => (req, _res, next) => {
  const validated = {};
  const issues = [];

  for (const location of ["params", "query", "body"]) {
    if (!schemas[location]) continue;
    try {
      validated[location] = schemas[location].parse(req[location] ?? {});
    } catch (err) {
      if (!(err instanceof ZodError)) throw err;
      for (const issue of err.issues) {
        issues.push({ location, field: issue.path.join(".") || undefined, message: issue.message });
      }
    }
  }

  if (issues.length > 0) {
    return next(new AppError(400, "VALIDATION_ERROR", "Request validation failed", issues));
  }
  req.validated = validated;
  next();
};
