import { z } from "zod";
import { RESERVATION_STATUSES } from "../config/constants.js";
import { paginationQuery } from "../utils/pagination.js";
import { atLeastOne, hhmm, isoDate, optionalText, sortQuery, text } from "./common.js";

const SORTABLE = ["date", "startTime", "createdAt", "title", "status"];

const participants = z
  .number("Participants must be a number")
  .int("Participants must be a whole number")
  .min(1, "At least one participant")
  .max(500);

export const listReservationsQuery = z
  .object({
    status: z.enum(RESERVATION_STATUSES).optional(),
    roomId: z.uuid().optional(),
    // Ignored for employees, who only ever see their own reservations.
    userId: z.uuid().optional(),
    date: isoDate.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    q: z.string().trim().max(100).optional(),
    sort: sortQuery(SORTABLE, "-date"),
    ...paginationQuery,
  })
  .refine((v) => !(v.from && v.to) || v.from <= v.to, { message: "from must not be after to", path: ["from"] });

export const createReservationBody = z.object({
  roomId: z.uuid("roomId must be a valid UUID"),
  // Admins may book on someone's behalf; employees always book for themselves.
  userId: z.uuid("userId must be a valid UUID").optional(),
  title: text("Title", 160).min(3, "Title must be at least 3 characters"),
  description: optionalText("Description", 500).default(""),
  date: isoDate,
  startTime: hhmm,
  endTime: hhmm,
  participants,
});

// PUT: fields left out keep their current value. Changing `status` cancels or completes the booking.
export const updateReservationBody = atLeastOne(
  z.object({
    roomId: z.uuid().optional(),
    title: text("Title", 160).min(3, "Title must be at least 3 characters").optional(),
    description: optionalText("Description", 500).optional(),
    date: isoDate.optional(),
    startTime: hhmm.optional(),
    endTime: hhmm.optional(),
    participants: participants.optional(),
    status: z.enum(RESERVATION_STATUSES).optional(),
  })
);
export { SORTABLE as RESERVATION_SORTABLE };
