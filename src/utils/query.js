import { and, asc, desc } from "drizzle-orm";
import { pageMeta } from "./pagination.js";

// "-date" → date DESC, "date" → date ASC. `columns` maps whitelisted sort keys to columns.
export function orderBy(sort, columns, tieBreaker) {
  const descending = sort.startsWith("-");
  const column = columns[sort.replace(/^-/, "")];
  const dir = descending ? desc : asc;
  return tieBreaker ? [dir(column), asc(tieBreaker)] : [dir(column)];
}

// Escape LIKE wildcards so user input is matched literally.
export const contains = (value) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

// and() that skips absent filters. `q && cond` can yield "" or false, which must not reach the SQL builder.
export const allOf = (...conditions) => and(...conditions.filter(Boolean));

export { pageMeta };
