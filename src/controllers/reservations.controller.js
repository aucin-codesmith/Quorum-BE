import { count, eq, gt, gte, ilike, lt, lte, ne, or } from "drizzle-orm";
import env from "../config/env.js";
import { db } from "../db/index.js";
import { reservations, rooms, users } from "../db/schema.js";
import { AppError, conflict, forbidden, notFound, validationError } from "../utils/AppError.js";
import { timeToMinutes, todayISO, toHHMM } from "../utils/dates.js";
import { offsetOf } from "../utils/pagination.js";
import { allOf, contains, orderBy, pageMeta } from "../utils/query.js";
import { created, noContent, ok } from "../utils/response.js";
import { serializeReservation } from "../utils/serializers.js";

const SORT_COLUMNS = {
  date: reservations.date,
  startTime: reservations.startTime,
  createdAt: reservations.createdAt,
  title: reservations.title,
  status: reservations.status,
};

// Reservation joined with its room and owner, in the shape serializeReservation expects.
const joined = () =>
  db
    .select({
      reservation: reservations,
      room: { id: rooms.id, name: rooms.name, floor: rooms.floor },
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(reservations)
    .innerJoin(rooms, eq(rooms.id, reservations.roomId))
    .innerJoin(users, eq(users.id, reservations.userId));

const toResponse = ({ reservation, room, user }) => serializeReservation(reservation, room, user);

async function findJoined(id) {
  const [row] = await joined().where(eq(reservations.id, id)).limit(1);
  return row;
}

const isAdmin = (req) => req.user.role === "admin";

// Employees can only see their own reservations. A missing and a foreign reservation look the same (404).
async function findVisible(req, id) {
  const row = await findJoined(id);
  if (!row || (!isAdmin(req) && row.reservation.userId !== req.user.id)) throw notFound("Reservation");
  return row;
}

// Every rule a booking must satisfy before it touches the database.
// The reservations_no_overlap exclusion constraint still guards against a concurrent request slipping past.
async function assertBookable({ roomId, date, startTime, endTime, participants, excludeId }) {
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw validationError("endTime", "End time must be after the start time");
  }
  if (timeToMinutes(startTime) < timeToMinutes(env.WORK_START) || timeToMinutes(endTime) > timeToMinutes(env.WORK_END)) {
    throw validationError("startTime", `Reservations must fall within working hours (${env.WORK_START}-${env.WORK_END})`);
  }
  if (date < todayISO()) throw validationError("date", "Reservations cannot be made in the past");

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) throw notFound("Room");
  if (room.status !== "available") {
    throw conflict(`${room.name} is not available for booking (${room.status})`, { roomStatus: room.status }, "ROOM_UNAVAILABLE");
  }
  if (participants > room.capacity) {
    throw validationError("participants", `${room.name} seats up to ${room.capacity}`);
  }

  // Half-open overlap: 10:00-11:00 and 11:00-12:00 do not conflict.
  const [clash] = await db
    .select({ id: reservations.id, title: reservations.title, startTime: reservations.startTime, endTime: reservations.endTime })
    .from(reservations)
    .where(
      allOf(
        eq(reservations.roomId, roomId),
        eq(reservations.date, date),
        ne(reservations.status, "cancelled"),
        lt(reservations.startTime, endTime),
        gt(reservations.endTime, startTime),
        excludeId && ne(reservations.id, excludeId)
      )
    )
    .limit(1);
  if (clash) {
    throw conflict(
      `${room.name} is already booked from ${toHHMM(clash.startTime)} to ${toHHMM(clash.endTime)}`,
      { conflictingReservation: { id: clash.id, title: clash.title, startTime: toHHMM(clash.startTime), endTime: toHHMM(clash.endTime) } },
      "RESERVATION_CONFLICT"
    );
  }
  return room;
}

// GET /api/reservations: admins see everything (filterable by user); employees see only their own
export async function listReservations(req, res) {
  const query = req.validated.query;
  const ownerId = isAdmin(req) ? query.userId : req.user.id;

  const where = allOf(
    query.status && eq(reservations.status, query.status),
    query.roomId && eq(reservations.roomId, query.roomId),
    ownerId && eq(reservations.userId, ownerId),
    query.date && eq(reservations.date, query.date),
    query.from && gte(reservations.date, query.from),
    query.to && lte(reservations.date, query.to),
    query.q &&
      or(
        ilike(reservations.title, contains(query.q)),
        ilike(rooms.name, contains(query.q)),
        ilike(users.name, contains(query.q))
      )
  );

  const [rows, [{ total }]] = await Promise.all([
    joined()
      .where(where)
      .orderBy(...orderBy(query.sort, SORT_COLUMNS, reservations.id))
      .limit(query.limit)
      .offset(offsetOf(query)),
    db
      .select({ total: count() })
      .from(reservations)
      .innerJoin(rooms, eq(rooms.id, reservations.roomId))
      .innerJoin(users, eq(users.id, reservations.userId))
      .where(where),
  ]);

  ok(res, rows.map(toResponse), pageMeta(query, total));
}

// GET /api/reservations/:id
export async function getReservation(req, res) {
  ok(res, toResponse(await findVisible(req, req.validated.params.id)));
}

// POST /api/reservations
export async function createReservation(req, res) {
  const { userId, ...booking } = req.validated.body;

  let ownerId = req.user.id;
  if (userId && userId !== req.user.id) {
    if (!isAdmin(req)) throw forbidden("Only administrators can book on behalf of another user");
    const [owner] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
    if (!owner) throw notFound("User");
    if (owner.status !== "active") throw conflict("That user's account is inactive", undefined, "USER_INACTIVE");
    ownerId = owner.id;
  }

  await assertBookable(booking);

  const [row] = await db.insert(reservations).values({ ...booking, userId: ownerId, status: "upcoming" }).returning();
  created(res, toResponse(await findJoined(row.id)));
}

const SCHEDULE_FIELDS = ["roomId", "date", "startTime", "endTime", "participants"];
const EDITABLE_FIELDS = ["title", "description", ...SCHEDULE_FIELDS];

// PUT /api/reservations/:id
// Owners and admins may edit an upcoming reservation or cancel it; only admins may mark it completed.
// Status changes travel alone so a request is either an edit or a transition, never both.
export async function updateReservation(req, res) {
  const patch = req.validated.body;
  const { reservation: current } = await findVisible(req, req.validated.params.id);

  if (patch.status !== undefined && patch.status !== current.status) {
    if (EDITABLE_FIELDS.some((f) => patch[f] !== undefined)) {
      throw validationError("status", "Change the status in its own request, without other fields");
    }
    const allowed =
      current.status === "upcoming" &&
      (patch.status === "cancelled" || (patch.status === "completed" && isAdmin(req)));
    if (!allowed) {
      const reason =
        current.status === "upcoming"
          ? "Only administrators can mark a reservation as completed"
          : `A ${current.status} reservation cannot change status`;
      throw new AppError(current.status === "upcoming" ? 403 : 409, "INVALID_STATUS_TRANSITION", reason);
    }
    await db.update(reservations).set({ status: patch.status }).where(eq(reservations.id, current.id));
    return ok(res, toResponse(await findJoined(current.id)));
  }

  const edits = Object.fromEntries(EDITABLE_FIELDS.filter((f) => patch[f] !== undefined).map((f) => [f, patch[f]]));
  if (Object.keys(edits).length > 0 && current.status !== "upcoming") {
    throw conflict(`A ${current.status} reservation can no longer be edited`, undefined, "RESERVATION_LOCKED");
  }

  // Compare against the current values in API form (HH:MM), not the raw HH:MM:SS from the database.
  const currentValues = {
    roomId: current.roomId,
    date: current.date,
    startTime: toHHMM(current.startTime),
    endTime: toHHMM(current.endTime),
    participants: current.participants,
  };
  const merged = { ...currentValues, ...edits };
  const scheduleChanged = SCHEDULE_FIELDS.some((f) => edits[f] !== undefined && edits[f] !== currentValues[f]);
  if (scheduleChanged) await assertBookable({ ...merged, excludeId: current.id });

  if (Object.keys(edits).length > 0) {
    await db.update(reservations).set(edits).where(eq(reservations.id, current.id));
  }
  ok(res, toResponse(await findJoined(current.id)));
}

// DELETE /api/reservations/:id: admin only; removes the record. Employees cancel via PUT { "status": "cancelled" }.
export async function deleteReservation(req, res) {
  const deleted = await db
    .delete(reservations)
    .where(eq(reservations.id, req.validated.params.id))
    .returning({ id: reservations.id });
  if (deleted.length === 0) throw notFound("Reservation");
  noContent(res);
}
