// src/modules/payments/payments.routes.js
const router = require("express").Router();

const { paymentsController } = require("./payments.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validateBody } = require("../../middleware/validate.middleware");
const { paymentSchema } = require("../../validation/schemas");

// Existing endpoints (keep them if you already had them)
router.post(
  "/orders/:orderId",
  authMiddleware,
  validateBody(paymentSchema),
  paymentsController.addPayment
);

router.get(
  "/orders/:orderId",
  authMiddleware,
  paymentsController.getPaymentsForOrder
);

// ✅ NEW: refund endpoint (manager/admin only is enforced inside controller)
router.post(
  "/orders/:orderId/refund",
  authMiddleware,
  validateBody(paymentSchema),
  paymentsController.addRefund
);

module.exports = router;
