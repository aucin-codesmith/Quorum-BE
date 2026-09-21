import cors from "cors";
import express from "express";
import helmet from "helmet";
import { sql } from "drizzle-orm";
import env from "./config/env.js";
import { db } from "./db/index.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import routes from "./routes/index.js";

const app = express();

if (env.TRUST_PROXY > 0) app.set("trust proxy", env.TRUST_PROXY);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Browsers only call the API from the configured front-end origins. Requests without an Origin
// header (curl, Postman, server-to-server) are not subject to CORS and are always allowed.
app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: "100kb" }));

// Liveness + database connectivity, used by the Docker healthcheck.
app.get("/health", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ok", uptime: Math.round(process.uptime()) });
  } catch {
    res.status(503).json({ error: { status: 503, code: "DATABASE_UNAVAILABLE", message: "Database is not reachable" } });
  }
});

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
