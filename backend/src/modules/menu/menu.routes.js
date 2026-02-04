// src/modules/menu/menu.routes.js
const { Router } = require("express");
const { menuController } = require("./menu.controller");
const {
  authMiddleware,
  requireRole,
} = require("../../middleware/auth.middleware");

const menuRouter = Router();

// POS / clients can read menu
menuRouter.get("/", (req, res, next) =>
  menuController.getMenu(req, res, next)
);

// Protected for editing
menuRouter.post(
  "/categories",
  authMiddleware,
  requireRole("admin", "manager"),
  (req, res, next) => menuController.createCategory(req, res, next)
);

menuRouter.post(
  "/items",
  authMiddleware,
  requireRole("admin", "manager"),
  (req, res, next) => menuController.createItem(req, res, next)
);

module.exports = menuRouter;

