import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { RESERVATION_STATUSES, ROOM_STATUSES, USER_ROLES, USER_STATUSES } from "../config/constants.js";

export const userRole = pgEnum("user_role", USER_ROLES);
export const userStatus = pgEnum("user_status", USER_STATUSES);
export const roomStatus = pgEnum("room_status", ROOM_STATUSES);
export const reservationStatus = pgEnum("reservation_status", RESERVATION_STATUSES);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    // Always stored lower-case; the unique constraint therefore makes email case-insensitive.
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    jobTitle: varchar("job_title", { length: 120 }).notNull().default(""),
    department: varchar("department", { length: 120 }).notNull().default(""),
    role: userRole("role").notNull().default("employee"),
    status: userStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [unique("users_email_unique").on(t.email)]
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 80 }).notNull(),
    floor: varchar("floor", { length: 120 }).notNull(),
    capacity: integer("capacity").notNull(),
    facilities: text("facilities").array().notNull().default(sql`'{}'::text[]`),
    image: text("image").notNull(),
    description: text("description").notNull().default(""),
    status: roomStatus("status").notNull().default("available"),
    ...timestamps,
  },
  (t) => [unique("rooms_name_unique").on(t.name), check("rooms_capacity_positive", sql`${t.capacity} > 0`)]
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // RESTRICT: a room or user with reservations on record cannot be deleted (deactivate / set to maintenance instead).
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description").notNull().default(""),
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("start_time", { precision: 0 }).notNull(),
    endTime: time("end_time", { precision: 0 }).notNull(),
    participants: integer("participants").notNull(),
    status: reservationStatus("status").notNull().default("upcoming"),
    ...timestamps,
  },
  (t) => [
    index("reservations_room_date_idx").on(t.roomId, t.date),
    index("reservations_user_idx").on(t.userId),
    index("reservations_date_idx").on(t.date),
    check("reservations_time_order", sql`${t.endTime} > ${t.startTime}`),
    check("reservations_participants_positive", sql`${t.participants} > 0`),
  ]
);
