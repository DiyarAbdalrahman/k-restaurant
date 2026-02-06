const router = require("express").Router();
const { authMiddleware, requireRole } = require("../../middleware/auth.middleware");
const { validateBody } = require("../../middleware/validate.middleware");
const { promotionSchema } = require("../../validation/schemas");
const controller = require("./promotions.controller");

router.get("/active", authMiddleware, controller.listActive);

router.get("/", authMiddleware, requireRole("admin", "manager"), controller.list);

router.post(
  "/",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(promotionSchema),
  controller.create
);

router.patch(
  "/:id",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(promotionSchema),
  controller.update
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole("admin", "manager"),
  controller.remove
);

module.exports = router;
