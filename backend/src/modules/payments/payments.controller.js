// src/modules/payments/payments.controller.js
const prisma = require("../../db/prisma");

class PaymentsController {
  async addPayment(req, res, next) {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const orderId = req.params.orderId;
      const { amount, method, note } = req.body;

      if (!["cash", "card", "split"].includes(method)) {
        return res.status(400).json({ message: "Invalid payment method" });
      }
      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ message: "Amount must be > 0" });
      }

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) return res.status(404).json({ message: "Order not found" });

      const payment = await prisma.payment.create({
        data: {
          orderId,
          amount: Number(amount),
          method,
          note,
          kind: "payment",
          createdBy: req.user.id,
        },
      });

      // Check if fully paid (net paid >= total) using payments only
      const paidAgg = await prisma.payment.aggregate({
        where: { orderId, kind: "payment" },
        _sum: { amount: true },
      });

      const paidTotal = paidAgg._sum.amount || 0;
      if (paidTotal >= Number(order.total) && order.status !== "paid") {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: "paid" },
        });
      }

      res.status(201).json(payment);
    } catch (err) {
      next(err);
    }
  }

  async addRefund(req, res, next) {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // 🔒 only admin/manager can refund
      if (!["admin", "manager"].includes(req.user.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const orderId = req.params.orderId;
      const { amount, method, note } = req.body;

      if (!["cash", "card", "split"].includes(method)) {
        return res.status(400).json({ message: "Invalid refund method" });
      }
      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ message: "Refund amount must be > 0" });
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { payments: true },
      });
      if (!order) return res.status(404).json({ message: "Order not found" });

      // Calculate how much is refundable (payments - refunds)
      const payAgg = await prisma.payment.aggregate({
        where: { orderId },
        _sum: { amount: true },
      });

      const payments = await prisma.payment.findMany({ where: { orderId } });
      const paid = payments
        .filter((p) => p.kind === "payment")
        .reduce((s, p) => s + p.amount, 0);
      const refunded = payments
        .filter((p) => p.kind === "refund")
        .reduce((s, p) => s + p.amount, 0);

      const refundable = Math.max(0, paid - refunded);

      if (Number(amount) > refundable) {
        return res.status(400).json({
          message: `Refund exceeds refundable amount. Refundable: ${refundable.toFixed(2)}`,
        });
      }

      const refund = await prisma.payment.create({
        data: {
          orderId,
          amount: Number(amount),
          method,
          note,
          kind: "refund",
          createdBy: req.user.id,
        },
      });

      res.status(201).json(refund);
    } catch (err) {
      next(err);
    }
  }

  async getPaymentsForOrder(req, res, next) {
    try {
      const orderId = req.params.orderId;
      const payments = await prisma.payment.findMany({
        where: { orderId },
        orderBy: { createdAt: "asc" },
      });
      res.json(payments);
    } catch (err) {
      next(err);
    }
  }
}

const paymentsController = new PaymentsController();
module.exports = { paymentsController };
