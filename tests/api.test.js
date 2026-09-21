// Integration tests against a RUNNING API with the demo seed loaded:
//   docker compose up -d --build && npm test
// Override the target with BASE_URL=http://host:port. Each run cleans up what it creates.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";
const run = Date.now().toString(36);

async function call(method, path, { token, body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

const login = async (email, password = PASSWORD) => {
  const r = await call("POST", "/api/auth/login", { body: { email, password } });
  assert.equal(r.status, 200, `login ${email} failed: ${JSON.stringify(r.json)}`);
  return r.json.data;
};

const shift = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const expectError = (r, status, code) => {
  assert.equal(r.status, status, JSON.stringify(r.json));
  assert.equal(r.json.error.status, status);
  assert.equal(r.json.error.code, code);
  assert.equal(typeof r.json.error.message, "string");
};

describe("QUORUM API", () => {
  let admin, employee, alya;
  const cleanup = { reservations: [], users: [], rooms: [] };
  let harbor, anchor, cascade, meridian;

  before(async () => {
    admin = await login("admin@company.com");
    alya = await login("alya.ramadhani@company.com");
    const rooms = (await call("GET", "/api/rooms?limit=100", { token: admin.token })).json.data;
    const byName = (n) => rooms.find((r) => r.name === n);
    [harbor, anchor, cascade, meridian] = ["Harbor", "Anchor", "Cascade", "Meridian"].map(byName);
    assert.ok(harbor && anchor && cascade && meridian, "demo seed rooms are missing; run the API with SEED_ON_START=true");
  });

  after(async () => {
    for (const id of cleanup.reservations) await call("DELETE", `/api/reservations/${id}`, { token: admin.token });
    for (const id of cleanup.users) await call("DELETE", `/api/users/${id}`, { token: admin.token });
    for (const id of cleanup.rooms) await call("DELETE", `/api/rooms/${id}`, { token: admin.token });
  });

  describe("platform", () => {
    test("GET /health reports database connectivity", async () => {
      const r = await call("GET", "/health");
      assert.equal(r.status, 200);
      assert.equal(r.json.status, "ok");
    });

    test("unknown routes return the uniform JSON error", async () => {
      expectError(await call("GET", "/api/nope"), 404, "ROUTE_NOT_FOUND");
    });

    test("malformed JSON is a 400, not a crash", async () => {
      expectError(await call("POST", "/api/auth/login", { body: "{oops" }), 400, "INVALID_JSON");
    });

    test("CORS allows the configured front-end origin and answers preflight", async () => {
      const r = await call("OPTIONS", "/api/rooms", {
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "authorization,content-type",
        },
      });
      assert.equal(r.status, 204);
      assert.equal(r.headers.get("access-control-allow-origin"), "http://localhost:5173");
      assert.match(r.headers.get("access-control-allow-headers"), /authorization/i);
    });

    test("CORS does not grant access to unknown origins", async () => {
      const r = await call("GET", "/health", { headers: { Origin: "https://evil.example" } });
      assert.equal(r.headers.get("access-control-allow-origin"), null);
    });
  });

  describe("authentication", () => {
    const email = `test.${run}@example.com`;

    test("register creates an employee and returns a token; the password is never returned", async () => {
      const r = await call("POST", "/api/auth/register", {
        body: { name: "Test Person", email: email.toUpperCase(), password: "Sup3rSecret" },
      });
      assert.equal(r.status, 201);
      assert.equal(r.json.data.user.role, "employee");
      assert.equal(r.json.data.user.email, email, "email is stored lower-case");
      assert.ok(r.json.data.token);
      assert.equal(JSON.stringify(r.json).includes("password"), false);
      employee = r.json.data;
      cleanup.users.push(employee.user.id);
    });

    test("registering the same email again is a 409, whatever the letter case", async () => {
      expectError(
        await call("POST", "/api/auth/register", { body: { name: "Dup", email, password: "Sup3rSecret" } }),
        409,
        "EMAIL_TAKEN"
      );
    });

    test("register cannot be used to self-assign the admin role", async () => {
      const e = `sneaky.${run}@example.com`;
      const r = await call("POST", "/api/auth/register", {
        body: { name: "Sneaky", email: e, password: "Sup3rSecret", role: "admin" },
      });
      assert.equal(r.status, 201);
      assert.equal(r.json.data.user.role, "employee");
      cleanup.users.push(r.json.data.user.id);
    });

    test("register validates every field and reports each problem", async () => {
      const r = await call("POST", "/api/auth/register", { body: { name: "x", email: "not-an-email", password: "short" } });
      expectError(r, 400, "VALIDATION_ERROR");
      const fields = r.json.error.details.map((d) => d.field);
      assert.ok(["name", "email", "password"].every((f) => fields.includes(f)), fields.join(","));
    });

    test("login rejects a wrong password and an unknown email with the same 401", async () => {
      const wrong = await call("POST", "/api/auth/login", { body: { email, password: "WrongPass1" } });
      const unknown = await call("POST", "/api/auth/login", { body: { email: `ghost.${run}@example.com`, password: "WrongPass1" } });
      expectError(wrong, 401, "INVALID_CREDENTIALS");
      expectError(unknown, 401, "INVALID_CREDENTIALS");
      assert.equal(wrong.json.error.message, unknown.json.error.message);
    });

    test("an inactive account cannot sign in (403)", async () => {
      expectError(
        await call("POST", "/api/auth/login", { body: { email: "farhan.malik@company.com", password: PASSWORD } }),
        403,
        "ACCOUNT_INACTIVE"
      );
    });

    test("GET /api/auth/me returns the profile for a valid token", async () => {
      const r = await call("GET", "/api/auth/me", { token: employee.token });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.email, email);
    });

    test("private endpoints reject missing, malformed and tampered tokens (401)", async () => {
      expectError(await call("GET", "/api/rooms"), 401, "UNAUTHORIZED");
      expectError(await call("GET", "/api/rooms", { headers: { Authorization: "Token abc" } }), 401, "UNAUTHORIZED");
      expectError(await call("GET", "/api/rooms", { token: `${employee.token}x` }), 401, "INVALID_TOKEN");
    });
  });

  describe("rooms", () => {
    test("lists rooms with pagination metadata", async () => {
      const r = await call("GET", "/api/rooms?limit=2&page=1", { token: employee.token });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.length, 2);
      assert.ok(r.json.meta.total >= 6);
      assert.equal(r.json.meta.limit, 2);
      assert.ok(r.json.data[0].upcomingReservations !== undefined);
    });

    test("filters by status, capacity, facilities and search text", async () => {
      const t = employee.token;
      const maint = await call("GET", "/api/rooms?status=maintenance", { token: t });
      assert.ok(maint.json.data.every((x) => x.status === "maintenance") && maint.json.data.length >= 1);
      const big = await call("GET", "/api/rooms?minCapacity=10", { token: t });
      assert.ok(big.json.data.every((x) => x.capacity >= 10));
      const fac = await call("GET", `/api/rooms?facilities=${encodeURIComponent("Whiteboard,Video Conferencing")}`, { token: t });
      assert.ok(fac.json.data.every((x) => x.facilities.includes("Whiteboard") && x.facilities.includes("Video Conferencing")));
      const q = await call("GET", "/api/rooms?q=mer", { token: t });
      assert.ok(q.json.data.some((x) => x.name === "Meridian"));
    });

    test("empty ?q= is ignored rather than breaking the query", async () => {
      assert.equal((await call("GET", "/api/rooms?q=", { token: employee.token })).status, 200);
    });

    test("rejects unknown sort keys, bad facilities and non-UUID ids with 400", async () => {
      const t = employee.token;
      expectError(await call("GET", "/api/rooms?sort=password", { token: t }), 400, "VALIDATION_ERROR");
      expectError(await call("GET", "/api/rooms?facilities=Jacuzzi", { token: t }), 400, "VALIDATION_ERROR");
      expectError(await call("GET", "/api/rooms/123", { token: t }), 400, "VALIDATION_ERROR");
    });

    test("an unknown room is a 404", async () => {
      expectError(await call("GET", "/api/rooms/00000000-0000-4000-8000-000000000000", { token: employee.token }), 404, "NOT_FOUND");
    });

    test("employees cannot create, edit or delete rooms (403)", async () => {
      const t = employee.token;
      expectError(await call("POST", "/api/rooms", { token: t, body: { name: "Nope", floor: "F1", capacity: 4 } }), 403, "FORBIDDEN");
      expectError(await call("PUT", `/api/rooms/${harbor.id}`, { token: t, body: { capacity: 99 } }), 403, "FORBIDDEN");
      expectError(await call("DELETE", `/api/rooms/${harbor.id}`, { token: t }), 403, "FORBIDDEN");
    });

    test("admin room CRUD, including unique names and delete guard", async () => {
      const t = admin.token;
      const name = `Atlas ${run}`;
      const c = await call("POST", "/api/rooms", { token: t, body: { name, floor: "Floor 2, East Wing", capacity: 6, facilities: ["Whiteboard", "Whiteboard"] } });
      assert.equal(c.status, 201);
      assert.deepEqual(c.json.data.facilities, ["Whiteboard"], "duplicate facilities collapse");
      assert.ok(c.json.data.image.startsWith("http"), "default image applied");
      const id = c.json.data.id;
      cleanup.rooms.push(id);

      expectError(await call("POST", "/api/rooms", { token: t, body: { name, floor: "x1", capacity: 4 } }), 409, "ROOM_NAME_TAKEN");
      expectError(await call("POST", "/api/rooms", { token: t, body: { name: "Bad", floor: "F", capacity: 0 } }), 400, "VALIDATION_ERROR");
      expectError(await call("PUT", `/api/rooms/${id}`, { token: t, body: {} }), 400, "VALIDATION_ERROR");

      const u = await call("PUT", `/api/rooms/${id}`, { token: t, body: { capacity: 8, status: "maintenance" } });
      assert.equal(u.status, 200);
      assert.equal(u.json.data.capacity, 8);
      assert.equal(u.json.data.name, name, "omitted fields are unchanged");

      // A room with reservations on record cannot be deleted.
      expectError(await call("DELETE", `/api/rooms/${meridian.id}`, { token: t }), 409, "ROOM_HAS_RESERVATIONS");

      assert.equal((await call("DELETE", `/api/rooms/${id}`, { token: t })).status, 204);
      cleanup.rooms.pop();
      expectError(await call("GET", `/api/rooms/${id}`, { token: t }), 404, "NOT_FOUND");
    });

    test("GET /api/rooms/:id/schedule lists the day's booked slots", async () => {
      const r = await call("GET", `/api/rooms/${meridian.id}/schedule`, { token: employee.token });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.room.name, "Meridian");
      assert.ok(r.json.data.reservations.every((s) => /^\d\d:\d\d$/.test(s.startTime)));
    });
  });

  describe("users (admin only)", () => {
    test("employees are forbidden; admins can list with filters", async () => {
      expectError(await call("GET", "/api/users", { token: employee.token }), 403, "FORBIDDEN");
      const r = await call("GET", "/api/users?role=admin&status=active", { token: admin.token });
      assert.equal(r.status, 200);
      assert.ok(r.json.data.length >= 2 && r.json.data.every((u) => u.role === "admin"));
      assert.equal(JSON.stringify(r.json).includes("passwordHash"), false);
    });

    test("admin creates, updates and deletes a user; email stays unique", async () => {
      const t = admin.token;
      const email = `made.${run}@example.com`;
      const c = await call("POST", "/api/users", { token: t, body: { name: "Made By Admin", email, password: "Sup3rSecret", role: "admin", department: "Ops" } });
      assert.equal(c.status, 201);
      const id = c.json.data.id;
      cleanup.users.push(id);

      expectError(await call("POST", "/api/users", { token: t, body: { name: "Dup", email, password: "Sup3rSecret" } }), 409, "EMAIL_TAKEN");
      expectError(await call("PUT", `/api/users/${id}`, { token: t, body: { email: "alya.ramadhani@company.com" } }), 409, "EMAIL_TAKEN");

      const u = await call("PUT", `/api/users/${id}`, { token: t, body: { jobTitle: "Lead", status: "inactive" } });
      assert.equal(u.status, 200);
      assert.equal(u.json.data.status, "inactive");
      assert.equal(u.json.data.department, "Ops", "omitted fields are unchanged");

      assert.equal((await call("DELETE", `/api/users/${id}`, { token: t })).status, 204);
      cleanup.users.pop();
    });

    test("an admin cannot demote, deactivate or delete their own account", async () => {
      const t = admin.token;
      const id = admin.user.id;
      expectError(await call("PUT", `/api/users/${id}`, { token: t, body: { role: "employee" } }), 403, "FORBIDDEN");
      expectError(await call("PUT", `/api/users/${id}`, { token: t, body: { status: "inactive" } }), 403, "FORBIDDEN");
      expectError(await call("DELETE", `/api/users/${id}`, { token: t }), 403, "FORBIDDEN");
    });

    test("a user with reservations on record cannot be deleted", async () => {
      expectError(await call("DELETE", `/api/users/${alya.user.id}`, { token: admin.token }), 409, "USER_HAS_RESERVATIONS");
    });

    test("a deactivated user's existing token stops working immediately", async () => {
      const t = admin.token;
      const email = `soon.gone.${run}@example.com`;
      const reg = (await call("POST", "/api/auth/register", { body: { name: "Soon Gone", email, password: "Sup3rSecret" } })).json.data;
      cleanup.users.push(reg.user.id);
      assert.equal((await call("GET", "/api/auth/me", { token: reg.token })).status, 200);
      await call("PUT", `/api/users/${reg.user.id}`, { token: t, body: { status: "inactive" } });
      expectError(await call("GET", "/api/auth/me", { token: reg.token }), 403, "ACCOUNT_INACTIVE");
    });
  });

  describe("reservations", () => {
    const day = shift(4);
    const slot = (start, end, extra = {}) => ({ roomId: harbor.id, title: "Sync meeting", date: day, startTime: start, endTime: end, participants: 4, ...extra });
    let mine;

    test("employee books a free slot and gets the joined room and user back", async () => {
      const r = await call("POST", "/api/reservations", { token: employee.token, body: slot("15:00", "16:00") });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.data.status, "upcoming");
      assert.equal(r.json.data.startTime, "15:00");
      assert.equal(r.json.data.room.name, "Harbor");
      assert.equal(r.json.data.user.id, employee.user.id);
      mine = r.json.data;
      cleanup.reservations.push(mine.id);
    });

    test("an overlapping booking is a 409 that names the clash", async () => {
      for (const [s, e] of [["15:00", "16:00"], ["15:30", "16:30"], ["14:00", "15:30"], ["14:30", "16:30"]]) {
        const r = await call("POST", "/api/reservations", { token: alya.token, body: slot(s, e) });
        expectError(r, 409, "RESERVATION_CONFLICT");
        assert.equal(r.json.error.details.conflictingReservation.id, mine.id);
      }
    });

    test("back-to-back bookings are allowed (half-open intervals)", async () => {
      const r = await call("POST", "/api/reservations", { token: alya.token, body: slot("16:00", "17:00") });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      cleanup.reservations.push(r.json.data.id);
    });

    test("two simultaneous requests for one slot: exactly one wins", async () => {
      const racing = slot("09:00", "10:00", { date: shift(6), roomId: meridian.id });
      const results = await Promise.all([
        call("POST", "/api/reservations", { token: employee.token, body: racing }),
        call("POST", "/api/reservations", { token: alya.token, body: racing }),
        call("POST", "/api/reservations", { token: admin.token, body: racing }),
      ]);
      const statuses = results.map((r) => r.status).sort();
      assert.deepEqual(statuses, [201, 409, 409], JSON.stringify(results.map((r) => r.json)));
      for (const r of results) if (r.status === 201) cleanup.reservations.push(r.json.data.id);
      for (const r of results) if (r.status === 409) assert.equal(r.json.error.code, "RESERVATION_CONFLICT");
    });

    test("validation: past date, outside working hours, end before start, over capacity", async () => {
      const t = employee.token;
      expectError(await call("POST", "/api/reservations", { token: t, body: slot("10:00", "11:00", { date: shift(-1) }) }), 400, "VALIDATION_ERROR");
      expectError(await call("POST", "/api/reservations", { token: t, body: slot("07:00", "08:00") }), 400, "VALIDATION_ERROR");
      expectError(await call("POST", "/api/reservations", { token: t, body: slot("10:00", "09:00") }), 400, "VALIDATION_ERROR");
      const cap = await call("POST", "/api/reservations", { token: t, body: slot("11:00", "12:00", { participants: harbor.capacity + 1 }) });
      expectError(cap, 400, "VALIDATION_ERROR");
      assert.equal(cap.json.error.details[0].field, "participants");
      expectError(await call("POST", "/api/reservations", { token: t, body: { roomId: "x" } }), 400, "VALIDATION_ERROR");
      expectError(await call("POST", "/api/reservations", { token: t, body: slot("10:00", "11:00", { date: "2026-02-31" }) }), 400, "VALIDATION_ERROR");
    });

    test("rooms that are not available cannot be booked", async () => {
      for (const room of [anchor, cascade]) {
        expectError(await call("POST", "/api/reservations", { token: employee.token, body: slot("11:00", "12:00", { roomId: room.id }) }), 409, "ROOM_UNAVAILABLE");
      }
      expectError(
        await call("POST", "/api/reservations", { token: employee.token, body: slot("11:00", "12:00", { roomId: "00000000-0000-4000-8000-000000000000" }) }),
        404,
        "NOT_FOUND"
      );
    });

    test("only admins can book on behalf of someone else", async () => {
      const onBehalf = slot("11:00", "12:00", { userId: alya.user.id });
      expectError(await call("POST", "/api/reservations", { token: employee.token, body: onBehalf }), 403, "FORBIDDEN");
      const r = await call("POST", "/api/reservations", { token: admin.token, body: onBehalf });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.data.user.id, alya.user.id);
      cleanup.reservations.push(r.json.data.id);
      const inactive = (await call("GET", "/api/users?status=inactive", { token: admin.token })).json.data[0];
      expectError(await call("POST", "/api/reservations", { token: admin.token, body: slot("12:00", "13:00", { userId: inactive.id }) }), 409, "USER_INACTIVE");
    });

    test("employees only ever see their own reservations", async () => {
      const list = await call("GET", "/api/reservations?limit=100", { token: employee.token });
      assert.ok(list.json.data.length >= 1);
      assert.ok(list.json.data.every((r) => r.user.id === employee.user.id));
      // Asking for someone else's via ?userId= is ignored, not honoured.
      const spoof = await call("GET", `/api/reservations?userId=${alya.user.id}&limit=100`, { token: employee.token });
      assert.ok(spoof.json.data.every((r) => r.user.id === employee.user.id));
      const adminList = await call("GET", "/api/reservations?limit=100", { token: admin.token });
      assert.ok(new Set(adminList.json.data.map((r) => r.user.id)).size > 1);
    });

    test("another user's reservation looks like it does not exist (404)", async () => {
      const others = (await call("GET", `/api/reservations?userId=${alya.user.id}&limit=1`, { token: admin.token })).json.data[0];
      expectError(await call("GET", `/api/reservations/${others.id}`, { token: employee.token }), 404, "NOT_FOUND");
      assert.equal((await call("GET", `/api/reservations/${others.id}`, { token: admin.token })).status, 200);
      expectError(await call("PUT", `/api/reservations/${others.id}`, { token: employee.token, body: { title: "Hijack" } }), 404, "NOT_FOUND");
    });

    test("admin list filters: status, room, date range and search", async () => {
      const t = admin.token;
      const done = await call("GET", "/api/reservations?status=completed&limit=100", { token: t });
      assert.ok(done.json.data.length >= 1 && done.json.data.every((r) => r.status === "completed"));
      const inRoom = await call("GET", `/api/reservations?roomId=${meridian.id}&limit=100`, { token: t });
      assert.ok(inRoom.json.data.every((r) => r.room.id === meridian.id));
      const range = await call("GET", `/api/reservations?from=${shift(0)}&to=${shift(1)}&limit=100`, { token: t });
      assert.ok(range.json.data.every((r) => r.date >= shift(0) && r.date <= shift(1)));
      const q = await call("GET", "/api/reservations?q=leadership", { token: t });
      assert.ok(q.json.data.some((r) => r.title === "Leadership Sync"));
      expectError(await call("GET", `/api/reservations?from=${shift(5)}&to=${shift(1)}`, { token: t }), 400, "VALIDATION_ERROR");
    });

    test("owner edits an upcoming reservation; a clashing edit is rejected", async () => {
      const t = employee.token;
      const ok = await call("PUT", `/api/reservations/${mine.id}`, { token: t, body: { title: "Renamed meeting", participants: 3 } });
      assert.equal(ok.status, 200);
      assert.equal(ok.json.data.title, "Renamed meeting");
      assert.equal(ok.json.data.startTime, "15:00", "omitted fields are unchanged");
      // 16:00-17:00 is held by Alya's booking, so stretching mine into it must fail.
      expectError(await call("PUT", `/api/reservations/${mine.id}`, { token: t, body: { endTime: "16:30" } }), 409, "RESERVATION_CONFLICT");
      // Editing without moving the slot never conflicts with itself.
      assert.equal((await call("PUT", `/api/reservations/${mine.id}`, { token: t, body: { startTime: "15:00", endTime: "16:00" } })).status, 200);
      expectError(await call("PUT", `/api/reservations/${mine.id}`, { token: t, body: {} }), 400, "VALIDATION_ERROR");
    });

    test("status rules: owners may cancel, only admins may complete, finished bookings are locked", async () => {
      const t = employee.token;
      const mix = await call("PUT", `/api/reservations/${mine.id}`, { token: t, body: { status: "cancelled", title: "x y z" } });
      expectError(mix, 400, "VALIDATION_ERROR");
      expectError(await call("PUT", `/api/reservations/${mine.id}`, { token: t, body: { status: "completed" } }), 403, "INVALID_STATUS_TRANSITION");

      const cancelled = await call("PUT", `/api/reservations/${mine.id}`, { token: t, body: { status: "cancelled" } });
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.json.data.status, "cancelled");
      expectError(await call("PUT", `/api/reservations/${mine.id}`, { token: t, body: { title: "Too late" } }), 409, "RESERVATION_LOCKED");
      expectError(await call("PUT", `/api/reservations/${mine.id}`, { token: admin.token, body: { status: "upcoming" } }), 409, "INVALID_STATUS_TRANSITION");

      // Cancelling frees the slot for someone else.
      const again = await call("POST", "/api/reservations", { token: alya.token, body: slot("15:00", "16:00") });
      assert.equal(again.status, 201, JSON.stringify(again.json));
      cleanup.reservations.push(again.json.data.id);

      const done = await call("PUT", `/api/reservations/${again.json.data.id}`, { token: admin.token, body: { status: "completed" } });
      assert.equal(done.status, 200);
      assert.equal(done.json.data.status, "completed");
    });

    test("only admins can delete a reservation record", async () => {
      expectError(await call("DELETE", `/api/reservations/${mine.id}`, { token: employee.token }), 403, "FORBIDDEN");
      assert.equal((await call("DELETE", `/api/reservations/${mine.id}`, { token: admin.token })).status, 204);
      cleanup.reservations = cleanup.reservations.filter((id) => id !== mine.id);
      expectError(await call("DELETE", `/api/reservations/${mine.id}`, { token: admin.token }), 404, "NOT_FOUND");
    });
  });

  describe("monitoring", () => {
    test("stats overview is admin-only and adds up", async () => {
      expectError(await call("GET", "/api/stats/overview", { token: employee.token }), 403, "FORBIDDEN");
      const r = await call("GET", "/api/stats/overview", { token: admin.token });
      assert.equal(r.status, 200);
      const { rooms, reservations, users, roomUtilization } = r.json.data;
      assert.equal(rooms.total, rooms.available + rooms.occupied + rooms.maintenance);
      assert.equal(reservations.total, reservations.upcoming + reservations.completed + reservations.cancelled);
      assert.ok(users.active <= users.total);
      assert.equal(roomUtilization.length, rooms.total);
      assert.ok(roomUtilization.every((u) => u.utilizationPercent >= 0 && u.utilizationPercent <= 100));
    });

    test("GET /api/facilities returns the catalogue", async () => {
      const r = await call("GET", "/api/facilities", { token: employee.token });
      assert.equal(r.status, 200);
      assert.ok(r.json.data.includes("Whiteboard"));
    });
  });
});
