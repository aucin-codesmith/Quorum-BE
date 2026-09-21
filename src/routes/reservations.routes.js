import { Router } from "express";
import {
  createReservation,
  deleteReservation,
  getReservation,
  listReservations,
  updateReservation,
} from "../controllers/reservations.controller.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParams } from "../validators/common.js";
import {
  createReservationBody,
  listReservationsQuery,
  updateReservationBody,
} from "../validators/reservations.validators.js";

const router = Router();

router.use(authenticate);

// Any signed-in user; employees are scoped to their own reservations inside the controller.
router.get("/", validate({ query: listReservationsQuery }), listReservations);
router.post("/", validate({ body: createReservationBody }), createReservation);
router.get("/:id", validate({ params: idParams }), getReservation);
router.put("/:id", validate({ params: idParams, body: updateReservationBody }), updateReservation);

// Administrators
router.delete("/:id", authorize("admin"), validate({ params: idParams }), deleteReservation);

export default router;
