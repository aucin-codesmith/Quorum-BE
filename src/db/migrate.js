import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

// The database container can accept connections a moment after it reports started, so retry briefly.
export async function runMigrations({ attempts = 15, delayMs = 2000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(db, { migrationsFolder });
      return;
    } catch (err) {
      const cause = err?.cause ?? err;
      const retryable = ["ECONNREFUSED", "ENOTFOUND", "57P03", "EAI_AGAIN"].includes(cause?.code);
      if (!retryable || attempt >= attempts) throw err;
      console.log(`Database not ready (${cause.code}), retrying ${attempt}/${attempts}...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runMigrations();
    console.log("Migrations applied");
  } catch (err) {
    console.error("Migration failed:", err?.cause?.message ?? err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
