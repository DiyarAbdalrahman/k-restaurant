// src/modules/payments/payments.controller.js
const prisma = require("../../db/prisma");
const bcrypt = require("bcryptjs");

class PaymentsController {
  async addPayment(req, res, next) {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const orderId = req.params.orderId;
      const { amount, method, note } = req.body;
      const settings = await prisma.settings.findFirst();

      if (!["cash", "card"].includes(method)) {
        return res.status(400).json({ message: "Invalid payment method" });
      }
      if (amount == null || Number(amount) < 0) {
        return res.status(400).json({ message: "Amount must be >= 0" });
      }
      if (Number(amount) === 0 && settings?.paymentAllowZero === false) {
        return res.status(400).json({ message: "Zero-amount payments are disabled" });
      }

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) return res.status(404).json({ message: "Order not found" });

      const payments = await prisma.payment.findMany({ where: { orderId } });
      const paid = payments
        .filter((p) => p.kind === "payment")
        .reduce((s, p) => s + p.amount, 0);
      const refunded = payments
        .filter((p) => p.kind === "refund")
        .reduce((s, p) => s + p.amount, 0);
      const netPaid = paid - refunded;
      const remaining = Math.max(0, Number(order.total) - netPaid);

      if (settings?.paymentAllowOverpay === false && Number(amount) > remaining + 0.0001) {
        return res.status(400).json({ message: "Amount exceeds remaining balance" });
      }

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

      const netPaidAfter = netPaid + Number(amount);
      const totalDue = Number(order.total);
      const epsilon = 0.0001;
      if (netPaidAfter + epsilon >= totalDue && order.status !== "paid") {
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
      const { amount, method, note, managerPin } = req.body;
      const settings = await prisma.settings.findFirst();

      if (!["cash", "card"].includes(method)) {
        return res.status(400).json({ message: "Invalid refund method" });
      }
      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ message: "Refund amount must be > 0" });
      }
      if (settings?.refundMaxAmount && Number(settings.refundMaxAmount) > 0) {
        if (Number(amount) > Number(settings.refundMaxAmount)) {
          return res.status(400).json({
            message: `Refund exceeds max: ${Number(settings.refundMaxAmount).toFixed(2)}`,
          });
        }
      }
      if (settings?.refundRequireManagerPin) {
        if (!managerPin || String(managerPin).length !== 4 || !req.user.pinHash) {
          return res.status(403).json({ message: "Manager PIN required" });
        }
        const ok = await bcrypt.compare(String(managerPin), req.user.pinHash);
        if (!ok) return res.status(403).json({ message: "Invalid manager PIN" });
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { payments: true },
      });
      if (!order) return res.status(404).json({ message: "Order not found" });

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

      const netPaid = paid - (refunded + Number(amount));
      if (netPaid < Number(order.total) && order.status === "paid") {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: "served" },
        });
      }

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
