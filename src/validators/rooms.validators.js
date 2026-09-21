import { z } from "zod";
import { FACILITIES, ROOM_STATUSES } from "../config/constants.js";
import { paginationQuery } from "../utils/pagination.js";
import { atLeastOne, isoDate, optionalText, sortQuery, text } from "./common.js";

const SORTABLE = ["name", "capacity", "floor", "status", "createdAt"];

const facilities = z
  .array(z.enum(FACILITIES, { error: `Facility must be one of: ${FACILITIES.join(", ")}` }))
  .max(FACILITIES.length)
  .transform((list) => [...new Set(list)]);

const capacity = z.number("Capacity must be a number").int("Capacity must be a whole number").min(1).max(100);
const image = z.url("Image must be a full URL").max(2000);

export const listRoomsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(ROOM_STATUSES).optional(),
  minCapacity: z.coerce.number().int().min(1).optional(),
  // Comma-separated, e.g. ?facilities=Whiteboard,4K%20Display. A room must have all of them.
  facilities: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(FACILITIES, { error: `Facility must be one of: ${FACILITIES.join(", ")}` }))),
  sort: sortQuery(SORTABLE, "name"),
  ...paginationQuery,
});

export const createRoomBody = z.object({
  name: text("Name", 80).min(2, "Name must be at least 2 characters"),
  floor: text("Floor", 120),
  capacity,
  facilities: facilities.default([]),
  description: optionalText("Description", 1000).default(""),
  image: image.optional(),
  status: z.enum(ROOM_STATUSES).default("available"),
});

export const updateRoomBody = atLeastOne(
  z.object({
    name: text("Name", 80).min(2, "Name must be at least 2 characters").optional(),
    floor: text("Floor", 120).optional(),
    capacity: capacity.optional(),
    facilities: facilities.optional(),
    description: optionalText("Description", 1000).optional(),
    image: image.optional(),
    status: z.enum(ROOM_STATUSES).optional(),
  })
);

export const scheduleQuery = z.object({ date: isoDate.optional() });
