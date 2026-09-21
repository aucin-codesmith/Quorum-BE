import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { count, sql } from "drizzle-orm";
import env from "../config/env.js";
import { todayISO } from "../utils/dates.js";
import { db, pool } from "./index.js";
import { reservations, rooms, users } from "./schema.js";

// Demo data mirroring the front-end prototype. Reservation dates are relative to today so
// the admin overview always has live-looking data.
//
//   node src/db/seed.js           seed only when the database has no users yet
//   node src/db/seed.js --reset   wipe users, rooms and reservations first
//
// Every seeded account uses SEED_PASSWORD (default: Password123!). Never use this in production.

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";

const shift = (offset) => {
  const [y, m, d] = todayISO().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
};

const userSeed = [
  ["Alya Ramadhani", "alya.ramadhani@company.com", "Product Design Lead", "Design & Research", "employee", "active"],
  ["Bima Prasetyo", "bima.prasetyo@company.com", "Senior Engineer", "Engineering", "employee", "active"],
  ["Citra Lestari", "citra.lestari@company.com", "Finance Manager", "Finance", "employee", "active"],
  ["Dimas Anggara", "dimas.anggara@company.com", "Sales Director", "Sales", "employee", "active"],
  ["Eka Wulandari", "eka.wulandari@company.com", "HR Business Partner", "People", "employee", "active"],
  ["Farhan Malik", "farhan.malik@company.com", "Marketing Lead", "Marketing", "employee", "inactive"],
  ["Gita Permata", "admin@company.com", "Facilities Administrator", "Operations", "admin", "active"],
  ["Hendra Kusuma", "hendra.kusuma@company.com", "IT Administrator", "Operations", "admin", "active"],
];

const img = (id) => `https://images.unsplash.com/${id}?q=80&w=1200&auto=format&fit=crop`;

const roomSeed = [
  {
    name: "Meridian", floor: "Floor 8, West Wing", capacity: 12, status: "available",
    facilities: ["4K Display", "Video Conferencing", "Whiteboard", "Sound System"],
    image: img("photo-1497366216548-37526070297c"),
    description: "Our largest boardroom, built for leadership reviews and client presentations. Floor-to-ceiling windows overlook the city skyline, and the room is wired for full hybrid conferencing.",
  },
  {
    name: "Harbor", floor: "Floor 5, North Wing", capacity: 6, status: "available",
    facilities: ["Video Conferencing", "Whiteboard", "Wireless Presentation"],
    image: img("photo-1517502884422-41eaead166d4"),
    description: "A calm mid-size room suited to team stand-ups and stakeholder syncs, with a wireless presentation dock and an oversized writable wall.",
  },
  {
    name: "Cascade", floor: "Floor 5, South Wing", capacity: 4, status: "occupied",
    facilities: ["Whiteboard", "Natural Light"],
    image: img("photo-1503389152951-9f343605f61e"),
    description: "A compact focus room for small working sessions and 1:1s, tucked beside the south atrium with plenty of daylight.",
  },
  {
    name: "Beacon", floor: "Floor 12, East Wing", capacity: 8, status: "available",
    facilities: ["4K Display", "Video Conferencing", "Sound System", "Phone Line"],
    image: img("photo-1431540015161-0bf868a2d407"),
    description: "An executive-grade meeting room on the top floor, frequently used for external partner calls and quarterly planning.",
  },
  {
    name: "Junction", floor: "Floor 3, Core", capacity: 10, status: "available",
    facilities: ["Video Conferencing", "Whiteboard", "Standing Desks", "Wireless Presentation"],
    image: img("photo-1600508774634-4e11d34730e2"),
    description: "A flexible workshop-style room with standing desks and movable furniture, ideal for design sprints and cross-team collaboration.",
  },
  {
    name: "Anchor", floor: "Floor 3, Core", capacity: 4, status: "maintenance",
    facilities: ["Whiteboard", "Phone Line"],
    image: img("photo-1517048676732-d65bc937f952"),
    description: "A quiet phone-booth-adjacent room best suited for interviews, coaching conversations, and small confidential discussions.",
  },
];

// [room, user email, title, description, day offset, start, end, participants, status, created offset]
const reservationSeed = [
  ["Meridian", "dimas.anggara@company.com", "Leadership Sync", "Weekly leadership alignment on pipeline and hiring.", 0, "09:00", "10:00", 8, "upcoming", -3],
  ["Meridian", "dimas.anggara@company.com", "Client Kickoff — Orion", "Kickoff with the Orion account team and delivery leads.", 0, "13:00", "14:30", 9, "upcoming", -4],
  ["Harbor", "alya.ramadhani@company.com", "Design Critique", "Round of critique on the new booking flow.", 0, "11:00", "11:30", 5, "upcoming", -1],
  ["Cascade", "eka.wulandari@company.com", "1:1 Coaching Block", "Back-to-back coaching sessions.", 0, "08:30", "12:00", 2, "upcoming", -2],
  ["Cascade", "eka.wulandari@company.com", "Vendor Interview", "Interview with the shortlisted recruiting vendor.", 0, "14:00", "15:00", 3, "upcoming", -2],
  ["Beacon", "citra.lestari@company.com", "APAC Partner Call", "Quarterly call with APAC channel partners.", 0, "16:00", "17:00", 6, "upcoming", -5],
  ["Junction", "bima.prasetyo@company.com", "Sprint Planning", "Plan the next two-week sprint with the platform team.", 0, "14:00", "15:30", 9, "upcoming", -1],
  ["Harbor", "alya.ramadhani@company.com", "Weekly Design Sync", "Review current sprint progress and unblock design handoffs with engineering.", 1, "10:00", "10:45", 6, "upcoming", -3],
  ["Meridian", "citra.lestari@company.com", "Budget Planning FY27", "First pass on the FY27 budget with department heads.", 1, "14:00", "15:00", 10, "upcoming", -2],
  ["Beacon", "dimas.anggara@company.com", "Board Pre-read", "Walk through the board deck before circulation.", 2, "09:00", "10:00", 5, "upcoming", -1],
  ["Junction", "bima.prasetyo@company.com", "Design Sprint Day 1", "Kick off a three-day design sprint on onboarding.", 2, "13:00", "16:00", 8, "upcoming", -4],
  ["Junction", "alya.ramadhani@company.com", "Q4 Planning Workshop", "Cross-functional planning session for Q4 roadmap alignment across three teams.", 3, "10:00", "12:00", 9, "upcoming", -4],
  ["Harbor", "bima.prasetyo@company.com", "Team Retro", "Sprint retrospective.", -2, "15:00", "16:00", 6, "completed", -9],
  ["Meridian", "dimas.anggara@company.com", "Investor Update", "Monthly update for the investor group.", -3, "11:00", "12:00", 7, "completed", -10],
  ["Beacon", "eka.wulandari@company.com", "Candidate Debrief", "Debrief after the final interview loop.", -5, "10:00", "11:00", 4, "cancelled", -8],
  ["Cascade", "farhan.malik@company.com", "Mentoring Session", "Monthly mentoring catch-up.", -6, "13:00", "14:00", 2, "completed", -12],
  ["Meridian", "alya.ramadhani@company.com", "Client QBR — Nimbus Co.", "Quarterly business review with the Nimbus account team, including renewal discussion.", -9, "13:00", "14:30", 8, "completed", -16],
  ["Beacon", "alya.ramadhani@company.com", "Executive Budget Review", "Annual budget walkthrough with finance leadership.", -13, "09:00", "10:00", 5, "completed", -22],
  ["Anchor", "alya.ramadhani@company.com", "Candidate Interview — Senior PM", "Final-round interview loop for the Senior Product Manager opening.", -16, "15:00", "15:45", 3, "cancelled", -25],
];

export async function seed({ reset = false } = {}) {
  if (reset) {
    await db.execute(sql`truncate table ${reservations}, ${rooms}, ${users} restart identity cascade`);
    console.log("Existing data removed");
  }

  const [{ existing }] = await db.select({ existing: count() }).from(users);
  if (existing > 0) {
    console.log(`Seed skipped: ${existing} users already present (use --reset to start over)`);
    return false;
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, env.BCRYPT_ROUNDS);
  const insertedUsers = await db
    .insert(users)
    .values(userSeed.map(([name, email, jobTitle, department, role, status]) => ({ name, email, jobTitle, department, role, status, passwordHash })))
    .returning({ id: users.id, email: users.email });
  const insertedRooms = await db.insert(rooms).values(roomSeed).returning({ id: rooms.id, name: rooms.name });

  const userId = Object.fromEntries(insertedUsers.map((u) => [u.email, u.id]));
  const roomId = Object.fromEntries(insertedRooms.map((r) => [r.name, r.id]));

  await db.insert(reservations).values(
    reservationSeed.map(([room, email, title, description, day, startTime, endTime, participants, status, createdDay]) => ({
      roomId: roomId[room],
      userId: userId[email],
      title,
      description,
      date: shift(day),
      startTime,
      endTime,
      participants,
      status,
      createdAt: new Date(`${shift(createdDay)}T09:00:00Z`),
    }))
  );

  console.log(`Seeded ${userSeed.length} users, ${roomSeed.length} rooms, ${reservationSeed.length} reservations`);
  console.log(`Sign in with admin@company.com or alya.ramadhani@company.com, password: ${SEED_PASSWORD}`);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await seed({ reset: process.argv.includes("--reset") });
  } catch (err) {
    console.error("Seed failed:", err?.cause?.message ?? err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
