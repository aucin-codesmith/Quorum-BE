import { toHHMM } from "./dates.js";

// Never expose passwordHash.
export const serializeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  jobTitle: u.jobTitle,
  department: u.department,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
  ...(u.upcomingReservations !== undefined && { upcomingReservations: u.upcomingReservations }),
});

export const serializeRoom = (r) => ({
  id: r.id,
  name: r.name,
  floor: r.floor,
  capacity: r.capacity,
  facilities: r.facilities,
  image: r.image,
  description: r.description,
  status: r.status,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  ...(r.upcomingReservations !== undefined && { upcomingReservations: r.upcomingReservations }),
});

// `room` and `user` are the joined summary objects, not full records.
export const serializeReservation = (r, room, user) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  date: r.date,
  startTime: toHHMM(r.startTime),
  endTime: toHHMM(r.endTime),
  participants: r.participants,
  status: r.status,
  room: room && { id: room.id, name: room.name, floor: room.floor },
  user: user && { id: user.id, name: user.name, email: user.email },
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});
