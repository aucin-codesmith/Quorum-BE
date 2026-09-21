-- Custom migration: prevent double-booking at the database level.
--
-- Two non-cancelled reservations for the same room may not overlap in time.
-- The range is half-open ([start, end)), so 10:00-11:00 and 11:00-12:00 are allowed.
-- The application checks first to return a friendly 409; this constraint is the
-- race-condition-proof backstop (PostgreSQL error 23P01).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist (
    "room_id" WITH =,
    tsrange(("date" + "start_time"), ("date" + "end_time"), '[)') WITH &&
  )
  WHERE ("status" <> 'cancelled');
