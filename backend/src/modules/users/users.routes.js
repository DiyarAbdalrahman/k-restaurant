const express = require("express");
const router = express.Router();
const usersController = require("./users.controller");
const { authMiddleware, requireRole } = require("../../middleware/auth.middleware");
const { validateBody } = require("../../middleware/validate.middleware");
const { userCreateSchema, userUpdateSchema } = require("../../validation/schemas");

// GET /api/users
router.get("/", authMiddleware, requireRole("admin", "manager"), usersController.getAllUsers);

router.post(
  "/",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(userCreateSchema),
  usersController.createUser
);

router.patch(
  "/:id",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(userUpdateSchema),
  usersController.updateUser
);

module.exports = router;
