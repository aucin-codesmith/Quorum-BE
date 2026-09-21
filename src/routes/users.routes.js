import { Router } from "express";
import { createUser, deleteUser, getUser, listUsers, updateUser } from "../controllers/users.controller.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParams } from "../validators/common.js";
import { createUserBody, listUsersQuery, updateUserBody } from "../validators/users.validators.js";

const router = Router();

// Everything under /api/users is administrator-only.
router.use(authenticate, authorize("admin"));

router.get("/", validate({ query: listUsersQuery }), listUsers);
router.post("/", validate({ body: createUserBody }), createUser);
router.get("/:id", validate({ params: idParams }), getUser);
router.put("/:id", validate({ params: idParams, body: updateUserBody }), updateUser);
router.delete("/:id", validate({ params: idParams }), deleteUser);

export default router;
