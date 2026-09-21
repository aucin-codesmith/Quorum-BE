import { Router } from "express";
import { overview } from "../controllers/stats.controller.js";
import { authenticate, authorize } from "../middlewares/auth.js";

const router = Router();

router.get("/overview", authenticate, authorize("admin"), overview);

export default router;
