// src/modules/tables/tables.routes.js
const { Router } = require("express");
const { tablesController } = require("./tables.controller");
const {
  authMiddleware,
  requireRole,
} = require("../../middleware/auth.middleware");

const tablesRouter = Router();

tablesRouter.get("/", authMiddleware, (req, res, next) =>
  tablesController.list(req, res, next)
);

tablesRouter.post(
  "/",
  authMiddleware,
  requireRole("admin", "manager"),
  (req, res, next) => tablesController.create(req, res, next)
);

module.exports = tablesRouter;

