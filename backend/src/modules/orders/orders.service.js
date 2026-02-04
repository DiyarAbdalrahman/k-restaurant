// src/modules/orders/orders.service.js
const prisma = require("../../db/prisma");
const { printKitchenTicket } = require("../../services/printer.service");

class OrdersService {
  // LIST OPEN ORDERS
  async listOpenOrders() {
    return prisma.order.findMany({
      where: {
        status: {
          in: ["open", "sent_to_kitchen", "in_progress", "ready"],
        },
      },
      include: {
        items: { include: { menuItem: true } },
        table: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // GET ONE
  async getOrder(id) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { menuItem: true } },
        table: true,
        payments: true,
      },
    });
  }

  // CREATE ORDER
  async createOrder(params) {
    const itemsData = await Promise.all(
      params.items.map(async (item) => {
        const menuItem = await prisma.menuItem.findUnique({
          where: { id: item.menuItemId },
        });

        if (!menuItem) {
          throw new Error(`Menu item not found: ${item.menuItemId}`);
        }

        return {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes || "",
          unitPrice: menuItem.basePrice,
          totalPrice: menuItem.basePrice * item.quantity,
        };
      })
    );

    const order = await prisma.order.create({
      data: {
        type: params.type,
        diningTableId: params.tableId || null,
        openedByUserId: params.openedByUserId,
        status: "open",
        notes: params.notes || "",

        subtotal: Number(params.subtotal) || 0,
        discountAmount: Number(params.discountAmount) || 0,
        taxAmount: Number(params.taxAmount) || 0,
        serviceCharge: Number(params.serviceCharge) || 0,
        total: Number(params.total) || 0,

        items: {
          create: itemsData,
        },
      },
      include: {
        items: { include: { menuItem: true } },
        table: true,
        payments: true,
      },
    });

    return order;
  }

  // UPDATE STATUS (KITCHEN / POS)
  async updateStatus(id, status) {
  const allowedStatuses = [
    "open",
    "sent_to_kitchen",
    "in_progress",
    "ready",
    "served",
    "paid",
    "cancelled",
  ];

  if (!allowedStatuses.includes(status)) {
    throw { status: 400, message: "Invalid status" };
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status },
    include: {
      items: { include: { menuItem: true } },
      table: true,
      payments: true,
    },
  });

  if (status === "sent_to_kitchen") {
    printKitchenTicket(updated).catch(console.error);
  }

  return updated;
}

}

const ordersService = new OrdersService();
module.exports = { ordersService };
