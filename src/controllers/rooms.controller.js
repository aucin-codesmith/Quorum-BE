import { and, arrayContains, count, eq, getTableColumns, gte, ilike, ne, or, sql } from "drizzle-orm";
import { DEFAULT_ROOM_IMAGE, FACILITIES } from "../config/constants.js";
import { db } from "../db/index.js";
import { reservations, rooms } from "../db/schema.js";
import { notFound } from "../utils/AppError.js";
import { todayISO, toHHMM } from "../utils/dates.js";
import { offsetOf } from "../utils/pagination.js";
import { allOf, contains, orderBy, pageMeta } from "../utils/query.js";
import { created, noContent, ok } from "../utils/response.js";
import { serializeRoom } from "../utils/serializers.js";

const upcomingReservations = sql`(
  select count(*)::int from ${reservations}
  where ${reservations.roomId} = ${rooms.id} and ${reservations.status} = 'upcoming'
)`
  .mapWith(Number)
  .as("upcoming_reservations");

const withCount = () => db.select({ ...getTableColumns(rooms), upcomingReservations }).from(rooms);

const SORT_COLUMNS = {
  name: rooms.name,
  capacity: rooms.capacity,
  floor: rooms.floor,
  status: rooms.status,
  createdAt: rooms.createdAt,
};

// GET /api/facilities: the fixed catalogue rooms can be tagged with
export function listFacilities(_req, res) {
  ok(res, FACILITIES);
}

// GET /api/rooms
export async function listRooms(req, res) {
  const query = req.validated.query;
  const where = allOf(
    query.q && or(ilike(rooms.name, contains(query.q)), ilike(rooms.floor, contains(query.q))),
    query.status && eq(rooms.status, query.status),
    query.minCapacity && gte(rooms.capacity, query.minCapacity),
    query.facilities.length > 0 && arrayContains(rooms.facilities, query.facilities)
  );

  const [rows, [{ total }]] = await Promise.all([
    withCount()
      .where(where)
      .orderBy(...orderBy(query.sort, SORT_COLUMNS, rooms.id))
      .limit(query.limit)
      .offset(offsetOf(query)),
    db.select({ total: count() }).from(rooms).where(where),
  ]);

  ok(res, rows.map(serializeRoom), pageMeta(query, total));
}

// GET /api/rooms/:id
export async function getRoom(req, res) {
  const [room] = await withCount().where(eq(rooms.id, req.validated.params.id)).limit(1);
  if (!room) throw notFound("Room");
  ok(res, serializeRoom(room));
}

// GET /api/rooms/:id/schedule?date=YYYY-MM-DD: booked slots for a day (default: today)
export async function getRoomSchedule(req, res) {
  const { id } = req.validated.params;
  const date = req.validated.query.date ?? todayISO();

  const [room] = await db.select({ id: rooms.id, name: rooms.name }).from(rooms).where(eq(rooms.id, id)).limit(1);
  if (!room) throw notFound("Room");

  const slots = await db
    .select({
      id: reservations.id,
      title: reservations.title,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      status: reservations.status,
    })
    .from(reservations)
    .where(and(eq(reservations.roomId, id), eq(reservations.date, date), ne(reservations.status, "cancelled")))
    .orderBy(reservations.startTime);

  ok(res, {
    room,
    date,
    reservations: slots.map((s) => ({ ...s, startTime: toHHMM(s.startTime), endTime: toHHMM(s.endTime) })),
  });
}

// POST /api/rooms: admin
export async function createRoom(req, res) {
  const body = req.validated.body;
  const [room] = await db
    .insert(rooms)
    .values({ ...body, image: body.image ?? DEFAULT_ROOM_IMAGE })
    .returning();
  created(res, serializeRoom(room));
}

// PUT /api/rooms/:id: admin; omitted fields keep their value
export async function updateRoom(req, res) {
  const [room] = await db.update(rooms).set(req.validated.body).where(eq(rooms.id, req.validated.params.id)).returning();
  if (!room) throw notFound("Room");
  ok(res, serializeRoom(room));
}

// DELETE /api/rooms/:id: admin. Refused (409) while reservations reference the room.
export async function deleteRoom(req, res) {
  const deleted = await db.delete(rooms).where(eq(rooms.id, req.validated.params.id)).returning({ id: rooms.id });
  if (deleted.length === 0) throw notFound("Room");
  noContent(res);
}
