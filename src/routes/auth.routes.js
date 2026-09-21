import { Router } from "express";
import { login, me, register } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { authLimiter } from "../middlewares/rateLimit.js";
import { validate } from "../middlewares/validate.js";
import { loginBody, registerBody } from "../validators/auth.validators.js";

const router = Router();

// Public
router.post("/register", authLimiter, validate({ body: registerBody }), register);
router.post("/login", authLimiter, validate({ body: loginBody }), login);

// Private
router.get("/me", authenticate, me);

export default router;
