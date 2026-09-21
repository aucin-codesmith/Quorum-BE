import app from "./app.js";
import env from "./config/env.js";
import { pool } from "./db/index.js";

const server = app.listen(env.PORT, () => {
  console.log(`QUORUM API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

// Finish in-flight requests, then release database connections.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  // Do not hang forever on stuck connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
