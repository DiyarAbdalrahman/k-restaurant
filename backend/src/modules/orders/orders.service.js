// src/modules/orders/orders.service.js
const prisma = require("../../db/prisma");
const { printKitchenTicket } = require("../../services/printer.service");
const {
  normalizeRules,
  applyPricingRules,
  applyPrintRules,
} = require("../../services/rules.service");

class OrdersService {
  // LIST OPEN ORDERS
  async listOpenOrders() {
    return prisma.order.findMany({
      where: {
        isDeleted: false,
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
    return prisma.order.findFirst({
      where: { id, isDeleted: false },
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
      where: { id: { startsWith: prefix }, isDeleted: false },
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
    const user = await prisma.user.findUnique({
      where: { id: params.openedByUserId },
      select: { role: true },
    });
    const itemsWithMenu = await Promise.all(
      params.items.map(async (item) => {
        const menuItem = await prisma.menuItem.findUnique({
          where: { id: item.menuItemId },
          include: { category: true },
        });

        if (!menuItem) {
          throw new Error(`Menu item not found: ${item.menuItemId}`);
        }

        return { item, menuItem };
      })
    );

    const isSoupCategoryName = (name) => {
      const n = String(name || "").trim().toLowerCase();
      if (!n) return false;
      if (n.includes("soup")) return true;
      if (n.includes("shle")) return true;
      if (n.includes("شله")) return true;
      return false;
    };

    const isSoup = (menuItem) => isSoupCategoryName(menuItem?.category?.name);

    const DEFAULT_SOUP_FREE_NAMES = [
      "Chicken Qozi",
      "Lamb Kawrma",
      "Lamb Qozi",
      "Mixed Qozi",
      "Organic Chicken",
      "Special Qozi",
    ];

    const normalizeName = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    const defaultSoupFreeSet = new Set(
      DEFAULT_SOUP_FREE_NAMES.map((n) => normalizeName(n))
    );

    let itemsData = itemsWithMenu.map(({ item, menuItem }) => {
      const qty = Number(item.quantity || 0);
      const base = Number(menuItem.basePrice || 0);
      let unitPrice = base;
      let totalPrice = base * qty;

      return {
        menuItemId: item.menuItemId,
        quantity: qty,
        notes: item.notes || "",
        guest: Number(item.guest) || 1,
        unitPrice,
        totalPrice,
      };
    });

    let rules = normalizeRules(settings?.rules);
    if (rules.length === 0) {
      const qualifyingItemIds = itemsWithMenu
        .filter(({ menuItem }) => defaultSoupFreeSet.has(normalizeName(menuItem?.name)))
        .map(({ menuItem }) => menuItem.id);
      const soupCategoryIds = Array.from(
        new Set(
          itemsWithMenu
            .filter(({ menuItem }) => isSoup(menuItem))
            .map(({ menuItem }) => menuItem.categoryId)
            .filter(Boolean)
        )
      );

      const soupCategoryId = soupCategoryIds[0];
      if (qualifyingItemIds.length > 0 && soupCategoryId) {
        rules = [
          {
            name: "Default soup free rule",
            enabled: true,
            priority: 100,
            applyMode: "stack",
            conditions: {
              match: "any",
              items: qualifyingItemIds.map((id) => ({
                kind: "item",
                id,
                minQty: 1,
              })),
            },
            actions: {
              freeItems: [
                {
                  kind: "category",
                  id: soupCategoryId,
                  freeQty: 1,
                  perMatchedItem: true,
                },
              ],
            },
          },
        ];
      }
    }
    if (rules.length > 0) {
      const ctx = {
        items: itemsWithMenu.map((x) => ({
          ...x.item,
          menuItem: x.menuItem,
        })),
        orderType: params.type,
        role: user?.role || "pos",
        tableId: params.tableId || null,
        now: new Date(),
      };
      const pricing = await applyPricingRules({ itemsWithMenu, itemsData, rules, ctx });
      itemsData = pricing.itemsData;
      params.ruleDiscountAmount = pricing.ruleDiscount || 0;
    }

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

    const ruleDiscount = Number(params.ruleDiscountAmount || 0);
    const totalDiscount = Math.min(subtotal, discountAmount + promoDiscount + ruleDiscount);
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
      const rules = normalizeRules(settings?.rules);
      const ctx = {
        items: order.items || [],
        orderType: order.type,
        role: user?.role || "pos",
        tableId: order.table?.id || null,
        now: new Date(),
      };
      const { kitchenOverrides } = applyPrintRules(order, settings, rules, ctx);
      printKitchenTicket(order, kitchenOverrides).catch(console.error);
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

  // LIST HISTORY (admin/manager)
  async listHistory({ from, to, q, status, limit = 200, includeDeleted = false }) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const where = {
      createdAt: { gte: fromDate, lte: toDate },
    };

    if (!includeDeleted) {
      where.isDeleted = false;
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (q) {
      where.id = { startsWith: q };
    }

    return prisma.order.findMany({
      where,
      include: {
        items: { include: { menuItem: true } },
        table: true,
        payments: true,
        openedByUser: { select: { id: true, fullName: true, username: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 200, 500),
    });
  }

  // DELETE ORDER (admin only)
  async deleteOrder(id, deletedByUserId) {
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.isDeleted) return existing;

    return prisma.order.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedByUserId,
      },
      include: {
        items: { include: { menuItem: true } },
        table: true,
        payments: true,
        openedByUser: { select: { id: true, fullName: true, username: true, role: true } },
      },
    });
  }

}

const ordersService = new OrdersService();
module.exports = { ordersService };
