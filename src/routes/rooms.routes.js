import { Router } from "express";
import {
  createRoom,
  deleteRoom,
  getRoom,
  getRoomSchedule,
  listRooms,
  updateRoom,
} from "../controllers/rooms.controller.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParams } from "../validators/common.js";
import { createRoomBody, listRoomsQuery, scheduleQuery, updateRoomBody } from "../validators/rooms.validators.js";

const router = Router();

router.use(authenticate);

// Any signed-in user
router.get("/", validate({ query: listRoomsQuery }), listRooms);
router.get("/:id", validate({ params: idParams }), getRoom);
router.get("/:id/schedule", validate({ params: idParams, query: scheduleQuery }), getRoomSchedule);

// Administrators
router.post("/", authorize("admin"), validate({ body: createRoomBody }), createRoom);
router.put("/:id", authorize("admin"), validate({ params: idParams, body: updateRoomBody }), updateRoom);
router.delete("/:id", authorize("admin"), validate({ params: idParams }), deleteRoom);

export default router;
