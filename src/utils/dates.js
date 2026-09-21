import env from "../config/env.js";

// Calendar date (YYYY-MM-DD) in the configured application timezone.
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: env.APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// PostgreSQL returns "09:00:00"; the API speaks "09:00".
export const toHHMM = (time) => String(time).slice(0, 5);
