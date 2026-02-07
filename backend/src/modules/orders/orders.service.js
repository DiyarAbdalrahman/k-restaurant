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
        openedByUser: { select: { id: true, fullName: true, username: true, role: true } },
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
        openedByUser: { select: { id: true, fullName: true, username: true, role: true } },
      },
    });
  }

  // FIND BY ID PREFIX (for refunds/search)
  async findByPrefix(prefix) {
    return prisma.order.findFirst({
      where: { id: { startsWith: prefix } },
      include: {
        items: { include: { menuItem: true } },
        table: true,
        payments: true,
        openedByUser: { select: { id: true, fullName: true, username: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // CREATE ORDER
  async createOrder(params) {
    const settings = await prisma.settings.findFirst();
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
          guest: Number(item.guest) || 1,
          unitPrice: menuItem.basePrice,
          totalPrice: menuItem.basePrice * item.quantity,
        };
      })
    );

    const subtotal = itemsData.reduce((sum, it) => sum + Number(it.totalPrice || 0), 0);
    let discountAmount = Number(params.discountAmount) || 0;
    if (discountAmount < 0) discountAmount = 0;
    if (discountAmount > subtotal) discountAmount = subtotal;
    const serviceCharge = Number(params.serviceCharge) || 0;
    const taxAmount = Number(params.taxAmount) || 0;

    const promotionIds = Array.isArray(params.promotionIds) ? params.promotionIds : [];
    let promoDiscount = 0;
    let appliedPromos = [];
    if (promotionIds.length > 0) {
      const promos = await prisma.promotion.findMany({
        where: { id: { in: promotionIds } },
        include: { categories: true, items: true },
      });

      for (const promo of promos) {
        let eligibleSubtotal = 0;
        const itemIds = new Set(promo.items.map((x) => x.menuItemId));
        const categoryIds = new Set(promo.categories.map((x) => x.categoryId));

        if (itemIds.size === 0 && categoryIds.size === 0) {
          eligibleSubtotal = subtotal;
        } else {
          for (const it of itemsData) {
            const menuItem = await prisma.menuItem.findUnique({
              where: { id: it.menuItemId },
              select: { categoryId: true },
            });
            const inItem = itemIds.has(it.menuItemId);
            const inCat = menuItem && categoryIds.has(menuItem.categoryId);
            if (inItem || inCat) {
              eligibleSubtotal += Number(it.totalPrice || 0);
            }
          }
        }

        if (eligibleSubtotal <= 0) continue;
        let discount = 0;
        if (promo.type === "percent") {
          discount = (eligibleSubtotal * Number(promo.amount || 0)) / 100;
        } else {
          discount = Number(promo.amount || 0);
        }
        if (discount > eligibleSubtotal) discount = eligibleSubtotal;
        promoDiscount += discount;
        appliedPromos.push({ id: promo.id, amount: discount });
      }
    }

    const totalDiscount = Math.min(subtotal, discountAmount + promoDiscount);
    const total = subtotal - totalDiscount + serviceCharge + taxAmount;

    const order = await prisma.order.create({
      data: {
        type: params.type,
        diningTableId: params.tableId || null,
        openedByUserId: params.openedByUserId,
        status: "sent_to_kitchen",
        notes: params.notes || "",

        subtotal,
        discountAmount: totalDiscount,
        taxAmount,
        serviceCharge,
        total,

        items: {
          create: itemsData,
        },
        promotions: {
          create: appliedPromos.map((p) => ({
            promotionId: p.id,
            amount: p.amount,
          })),
        },
      },
      include: {
        items: { include: { menuItem: true } },
        table: true,
        payments: true,
        openedByUser: { select: { id: true, fullName: true, username: true, role: true } },
        promotions: true,
      },
    });

    // Auto-send to kitchen on create (configurable)
    if (settings?.kitchenAutoPrint !== false) {
      printKitchenTicket(order).catch(console.error);
    }
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
        openedByUser: { select: { id: true, fullName: true, username: true, role: true } },
      },
    });

  if (status === "sent_to_kitchen") {
    printKitchenTicket(updated).catch(console.error);
  }

  return updated;
}

  // DELETE ORDER (admin only)
  async deleteOrder(id) {
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return null;

    await prisma.$transaction([
      prisma.orderPromotion.deleteMany({ where: { orderId: id } }),
      prisma.payment.deleteMany({ where: { orderId: id } }),
      prisma.orderItem.deleteMany({ where: { orderId: id } }),
      prisma.order.delete({ where: { id } }),
    ]);

    return existing;
  }

}

const ordersService = new OrdersService();
module.exports = { ordersService };
