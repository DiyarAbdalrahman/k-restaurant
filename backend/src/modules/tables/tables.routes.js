// src/modules/tables/tables.routes.js
const { Router } = require("express");
const { tablesController } = require("./tables.controller");
const {
  authMiddleware,
  requireRole,
} = require("../../middleware/auth.middleware");
const { validateBody } = require("../../middleware/validate.middleware");
const { tableCreateSchema, tableUpdateSchema } = require("../../validation/schemas");

const tablesRouter = Router();

tablesRouter.get("/", authMiddleware, (req, res, next) =>
  tablesController.list(req, res, next)
);

tablesRouter.post(
  "/",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(tableCreateSchema),
  (req, res, next) => tablesController.create(req, res, next)
);

tablesRouter.patch(
  "/:id",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(tableUpdateSchema),
  (req, res, next) => tablesController.update(req, res, next)
);

tablesRouter.delete(
  "/:id",
  authMiddleware,
  requireRole("admin", "manager"),
  (req, res, next) => tablesController.remove(req, res, next)
);

module.exports = tablesRouter;
