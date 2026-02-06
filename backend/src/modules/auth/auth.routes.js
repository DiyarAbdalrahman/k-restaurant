// src/modules/auth/auth.routes.js
const { Router } = require("express");
const { authController } = require("./auth.controller");
const { authMiddleware, requireRole } = require("../../middleware/auth.middleware");
const { validateBody } = require("../../middleware/validate.middleware");
const { authLoginSchema, authRegisterSchema, pinLoginSchema } = require("../../validation/schemas");

const authRouter = Router();

// Admin-only user creation
authRouter.post(
  "/register",
  authMiddleware,
  requireRole("admin"),
  validateBody(authRegisterSchema),
  (req, res, next) => authController.register(req, res, next)
);

authRouter.post("/login", validateBody(authLoginSchema), (req, res, next) =>
  authController.login(req, res, next)
);

authRouter.post("/pin-login", validateBody(pinLoginSchema), (req, res, next) =>
  authController.pinLogin(req, res, next)
);

authRouter.get("/switch-users", authMiddleware, (req, res, next) =>
  authController.listSwitchUsers(req, res, next)
);
authRouter.get("/me", authMiddleware, (req, res) =>
  authController.me(req, res)
);

module.exports = { authRouter };
