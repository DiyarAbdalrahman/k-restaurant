// src/modules/orders/orders.routes.js
const { Router } = require("express");
const { ordersController } = require("./orders.controller");
const {
  authMiddleware,
  requireRole,
} = require("../../middleware/auth.middleware");
const { validateBody } = require("../../middleware/validate.middleware");
const { orderCreateSchema, orderStatusSchema, orderAddItemsSchema, orderUpdateItemsSchema, orderCancelSchema } = require("../../validation/schemas");

const ordersRouter = Router();

ordersRouter.use(authMiddleware);

// GET all open orders
ordersRouter.get("/", (req, res, next) =>
  ordersController.listOpen(req, res, next)
);

// GET history (admin/manager)
ordersRouter.get(
  "/history",
  requireRole("admin", "manager"),
  (req, res, next) => ordersController.listHistory(req, res, next)
);

// CREATE order
ordersRouter.post("/", validateBody(orderCreateSchema), (req, res, next) =>
  ordersController.create(req, res, next)
);

// ADD ITEMS to existing open order
ordersRouter.post(
  "/:id/add-items",
  requireRole("waiter", "admin", "pos"),
  validateBody(orderAddItemsSchema),
  (req, res, next) => ordersController.addItems(req, res, next)
);

// UPDATE ITEMS on existing open order (add/remove)
ordersRouter.post(
  "/:id/update-items",
  requireRole("waiter", "admin", "pos"),
  validateBody(orderUpdateItemsSchema),
  (req, res, next) => ordersController.updateItems(req, res, next)
);

// Lookup by ID prefix
ordersRouter.get("/lookup", (req, res, next) =>
  ordersController.lookup(req, res, next)
);

// GET one
ordersRouter.get("/:id", (req, res, next) =>
  ordersController.getOne(req, res, next)
);

// Generic status update
ordersRouter.patch(
  "/:id/status",
  requireRole("waiter", "kitchen", "admin", "pos"),
  validateBody(orderStatusSchema),
  (req, res, next) => ordersController.updateStatus(req, res, next)
);

// Shortcuts
ordersRouter.post(
  "/:id/send-to-kitchen",
  requireRole("waiter", "admin", "pos"),
  (req, res, next) => ordersController.sendToKitchen(req, res, next)
);

ordersRouter.post(
  "/:id/cancel",
  requireRole("waiter", "admin", "manager", "pos"),
  validateBody(orderCancelSchema),
  (req, res, next) => ordersController.cancel(req, res, next)
);

ordersRouter.post(
  "/:id/in-progress",
  requireRole("kitchen", "admin", "pos"),
  (req, res, next) => ordersController.markInProgress(req, res, next)
);

ordersRouter.post(
  "/:id/ready",
  requireRole("kitchen", "admin", "pos"),
  (req, res, next) => ordersController.markReady(req, res, next)
);

// MANUAL PRINT
ordersRouter.post(
  "/:id/print-kitchen",
  requireRole("kitchen", "admin", "waiter", "pos"),
  (req, res, next) => ordersController.printKitchen(req, res, next)
);

ordersRouter.post(
  "/:id/print-receipt",
  requireRole("admin", "manager", "pos", "waiter"),
  (req, res, next) => ordersController.printReceipt(req, res, next)
);

// ADMIN DELETE (history cleanup)
ordersRouter.delete(
  "/:id",
  requireRole("admin"),
  (req, res, next) => ordersController.delete(req, res, next)
);

module.exports = ordersRouter;
