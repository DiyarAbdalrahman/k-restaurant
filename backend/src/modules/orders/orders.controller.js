// src/modules/orders/orders.controller.js
const { ordersService } = require("./orders.service");
const { printKitchenTicket, printCustomerReceipt } = require("../../services/printer.service");
const prisma = require("../../db/prisma");
const { emitOrderUpdated } = require("../kitchen/kitchen.gateway");


class OrdersController {
  async listOpen(req, res, next) {
    try {
      const orders = await ordersService.listOpenOrders();
      res.json(orders);
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const userId = req.user.id;
      const order = await ordersService.createOrder({
        ...req.body,
        openedByUserId: userId,
      });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const order = await ordersService.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (err) {
      next(err);
    }
  }

  async lookup(req, res, next) {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) return res.status(400).json({ message: "Query is required" });
      const order = await ordersService.findByPrefix(q);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      const updated = await ordersService.updateStatus(id, status);
      emitOrderUpdated(updated); // ✅ notify POS + kitchen

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  async sendToKitchen(req, res, next) {
    try {
      const updated = await ordersService.updateStatus(
        req.params.id,
        "sent_to_kitchen"
      );
      emitOrderUpdated(updated); // ✅ notify POS + kitchen
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  async markInProgress(req, res, next) {
    try {
      const updated = await ordersService.updateStatus(
        req.params.id,
        "in_progress"
      );
      emitOrderUpdated(updated); // ✅ notify POS + kitchen
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  async markReady(req, res, next) {
    try {
      const updated = await ordersService.updateStatus(
        req.params.id,
        "ready"
      );
      emitOrderUpdated(updated); // ✅ notify POS + kitchen
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  // MANUAL PRINT ENDPOINT
  async printKitchen(req, res, next) {
    try {
      const order = await ordersService.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      await printKitchenTicket(order);
      res.json({ message: "Kitchen ticket sent to printer" });
    } catch (err) {
      next(err);
    }
  }

  async printReceipt(req, res, next) {
    try {
      const order = await ordersService.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      const settings = await prisma.settings.findFirst();
      await printCustomerReceipt(order, settings);
      res.json({ message: "Receipt sent to printer" });
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const deleted = await ordersService.deleteOrder(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json({ message: "Order deleted", id: deleted.id });
    } catch (err) {
      next(err);
    }
  }
}

const ordersController = new OrdersController();
module.exports = { ordersController };
