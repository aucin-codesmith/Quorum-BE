import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import env from "../config/env.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

// An idle client erroring (e.g. the database restarts) must not crash the process.
pool.on("error", (err) => console.error("Unexpected PostgreSQL pool error:", err.message));

export const db = drizzle(pool, { schema });
