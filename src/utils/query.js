import { and, asc, desc } from "drizzle-orm";
import { pageMeta } from "./pagination.js";

// "-date" → date DESC, "date" → date ASC. `columns` maps whitelisted sort keys to columns.
// `tieBreakers` (a column or a list) keep pagination stable and follow the same direction,
// e.g. reservations sorted by date also order by start time within a day.
export function orderBy(sort, columns, tieBreakers = []) {
  const dir = sort.startsWith("-") ? desc : asc;
  const extra = [tieBreakers].flat().map((c) => dir(c));
  return [dir(columns[sort.replace(/^-/, "")]), ...extra];
}

// Escape LIKE wildcards so user input is matched literally.
export const contains = (value) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

// and() that skips absent filters. `q && cond` can yield "" or false, which must not reach the SQL builder.
export const allOf = (...conditions) => and(...conditions.filter(Boolean));

export { pageMeta };
