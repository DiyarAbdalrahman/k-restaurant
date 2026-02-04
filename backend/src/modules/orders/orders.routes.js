// src/modules/orders/orders.routes.js
const { Router } = require("express");
const { ordersController } = require("./orders.controller");
const {
  authMiddleware,
  requireRole,
} = require("../../middleware/auth.middleware");

const ordersRouter = Router();

ordersRouter.use(authMiddleware);

// GET all open orders
ordersRouter.get("/", (req, res, next) =>
  ordersController.listOpen(req, res, next)
);

// CREATE order
ordersRouter.post("/", (req, res, next) =>
  ordersController.create(req, res, next)
);

// GET one
ordersRouter.get("/:id", (req, res, next) =>
  ordersController.getOne(req, res, next)
);

// Generic status update
ordersRouter.patch(
  "/:id/status",
  requireRole("waiter", "chef", "admin","pos"),
  (req, res, next) => ordersController.updateStatus(req, res, next)
);

// Shortcuts
ordersRouter.post(
  "/:id/send-to-kitchen",
  requireRole("waiter", "admin","pos"),
  (req, res, next) => ordersController.sendToKitchen(req, res, next)
);

ordersRouter.post(
  "/:id/in-progress",
  requireRole("chef", "admin","pos"),
  (req, res, next) => ordersController.markInProgress(req, res, next)
);

ordersRouter.post(
  "/:id/ready",
  requireRole("chef", "admin","pos"),
  (req, res, next) => ordersController.markReady(req, res, next)
);

// MANUAL PRINT
ordersRouter.post(
  "/:id/print-kitchen",
  requireRole("chef", "admin", "waiter","pos"),
  (req, res, next) => ordersController.printKitchen(req, res, next)
);

module.exports = ordersRouter;
