import { Router } from "express";
import { listFacilities } from "../controllers/rooms.controller.js";
import { authenticate } from "../middlewares/auth.js";
import authRoutes from "./auth.routes.js";
import reservationsRoutes from "./reservations.routes.js";
import roomsRoutes from "./rooms.routes.js";
import statsRoutes from "./stats.routes.js";
import usersRoutes from "./users.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/rooms", roomsRoutes);
router.use("/reservations", reservationsRoutes);
router.use("/stats", statsRoutes);
router.get("/facilities", authenticate, listFacilities);

export default router;
