import { count, eq, sql } from "drizzle-orm";
import env from "../config/env.js";
import { db } from "../db/index.js";
import { reservations, rooms, users } from "../db/schema.js";
import { timeToMinutes, todayISO } from "../utils/dates.js";
import { ok } from "../utils/response.js";

const filtered = (condition) => sql`count(*) filter (where ${condition})`.mapWith(Number);

// GET /api/stats/overview: admin monitoring numbers in one round trip
export async function overview(_req, res) {
  const today = todayISO();
  const workMinutes = timeToMinutes(env.WORK_END) - timeToMinutes(env.WORK_START);

  const [[roomCounts], [reservationCounts], [userCounts], utilization] = await Promise.all([
    db
      .select({
        total: count(),
        available: filtered(eq(rooms.status, "available")),
        occupied: filtered(eq(rooms.status, "occupied")),
        maintenance: filtered(eq(rooms.status, "maintenance")),
      })
      .from(rooms),
    db
      .select({
        total: count(),
        upcoming: filtered(eq(reservations.status, "upcoming")),
        completed: filtered(eq(reservations.status, "completed")),
        cancelled: filtered(eq(reservations.status, "cancelled")),
        today: filtered(sql`${reservations.date} = ${today} and ${reservations.status} <> 'cancelled'`),
      })
      .from(reservations),
    db
      .select({
        total: count(),
        active: filtered(eq(users.status, "active")),
        admins: filtered(eq(users.role, "admin")),
      })
      .from(users),
    // Minutes booked per room today, against the configured working hours.
    db
      .select({
        roomId: rooms.id,
        roomName: rooms.name,
        bookedMinutes: sql`coalesce(sum(extract(epoch from (${reservations.endTime} - ${reservations.startTime})) / 60), 0)`.mapWith(Number),
      })
      .from(rooms)
      .leftJoin(
        reservations,
        sql`${reservations.roomId} = ${rooms.id} and ${reservations.date} = ${today} and ${reservations.status} <> 'cancelled'`
      )
      .groupBy(rooms.id, rooms.name)
      .orderBy(rooms.name),
  ]);

  ok(res, {
    date: today,
    rooms: roomCounts,
    reservations: reservationCounts,
    users: userCounts,
    roomUtilization: utilization.map((r) => ({
      ...r,
      utilizationPercent: Math.min(100, Math.round((r.bookedMinutes / workMinutes) * 100)),
    })),
  });
}
