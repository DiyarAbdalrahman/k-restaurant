// src/modules/auth/auth.routes.js
const { Router } = require("express");
const { authController } = require("./auth.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");

const authRouter = Router();

authRouter.post("/register", (req, res, next) =>
  authController.register(req, res, next)
);

authRouter.post("/login", (req, res, next) =>
  authController.login(req, res, next)
);

authRouter.get("/me", authMiddleware, (req, res) =>
  authController.me(req, res)
);

module.exports = { authRouter };
