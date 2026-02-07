const prisma = require("../db/prisma");

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function normalizeRule(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: raw.id || undefined,
    name: String(raw.name || "Rule").trim(),
    enabled: raw.enabled !== false,
    priority: Number(raw.priority || 100),
    applyMode: raw.applyMode === "first" ? "first" : "stack",
    conditions: {
      match: raw.conditions?.match === "any" ? "any" : "all",
      items: normalizeArray(raw.conditions?.items).filter(Boolean),
      orderTypes: normalizeArray(raw.conditions?.orderTypes).filter(Boolean),
      roles: normalizeArray(raw.conditions?.roles).filter(Boolean),
      days: normalizeArray(raw.conditions?.days)
        .map((d) => Number(d))
        .filter((d) => Number.isFinite(d)),
      time: raw.conditions?.time || null,
      tables: normalizeArray(raw.conditions?.tables).filter(Boolean),
    },
    actions: {
      freeItems: normalizeArray(raw.actions?.freeItems).filter(Boolean),
      discounts: normalizeArray(raw.actions?.discounts).filter(Boolean),
      addItems: normalizeArray(raw.actions?.addItems).filter(Boolean),
      print: raw.actions?.print || {},
    },
  };
}

function normalizeRules(rules) {
  return normalizeArray(rules)
    .map(normalizeRule)
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority);
}

function matchesTimeRange(time, now) {
  if (!time || !time.start || !time.end) return true;
  const [sh, sm] = String(time.start).split(":").map((v) => Number(v));
  const [eh, em] = String(time.end).split(":").map((v) => Number(v));
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) {
    return true;
  }
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start <= end) return current >= start && current <= end;
  // Overnight window (e.g. 22:00-02:00)
  return current >= start || current <= end;
}

function ruleMatches(rule, ctx) {
  const conditions = rule.conditions || {};
  const checks = [];

  if (conditions.items?.length) {
    const itemChecks = conditions.items.map((cond) => {
      const kind = cond.kind || "item";
      const minQty = Number(cond.minQty || 1);
      if (kind === "category") {
        const qty = ctx.items
          .filter((x) => x.menuItem?.categoryId === cond.id)
          .reduce((s, x) => s + Number(x.quantity || 0), 0);
        return qty >= minQty;
      }
      const qty = ctx.items
        .filter((x) => x.menuItem?.id === cond.id)
        .reduce((s, x) => s + Number(x.quantity || 0), 0);
      return qty >= minQty;
    });

    if (conditions.match === "any") checks.push(itemChecks.some(Boolean));
    else checks.push(itemChecks.every(Boolean));
  }

  if (conditions.orderTypes?.length) {
    checks.push(conditions.orderTypes.includes(ctx.orderType));
  }

  if (conditions.roles?.length) {
    checks.push(conditions.roles.includes(ctx.role));
  }

  if (conditions.tables?.length) {
    checks.push(conditions.tables.includes(ctx.tableId || ""));
  }

  if (conditions.days?.length) {
    const dow = ctx.now.getDay();
    checks.push(conditions.days.includes(dow));
  }

  if (conditions.time) {
    checks.push(matchesTimeRange(conditions.time, ctx.now));
  }

  if (checks.length === 0) return true;
  if (conditions.match === "any") return checks.some(Boolean);
  return checks.every(Boolean);
}

function matchedQtyForRule(rule, ctx) {
  const conditions = rule.conditions || {};
  if (!conditions.items?.length) return 0;
  return conditions.items.reduce((sum, cond) => {
    const kind = cond.kind || "item";
    if (kind === "category") {
      return (
        sum +
        ctx.items
          .filter((x) => x.menuItem?.categoryId === cond.id)
          .reduce((s, x) => s + Number(x.quantity || 0), 0)
      );
    }
    return (
      sum +
      ctx.items
        .filter((x) => x.menuItem?.id === cond.id)
        .reduce((s, x) => s + Number(x.quantity || 0), 0)
    );
  }, 0);
}

function applyFreeItems(itemsData, itemsWithMenu, action, matchedQty) {
  let remaining = action.perMatchedItem ? matchedQty : Number(action.freeQty || 0);
  if (remaining <= 0) return itemsData;

  const updated = itemsData.map((x) => ({ ...x }));

  const isTarget = (menuItemId) => {
    if (action.kind === "category") {
      const found = itemsWithMenu.find((x) => x.item.menuItemId === menuItemId);
      return found?.menuItem?.categoryId === action.id;
    }
    return menuItemId === action.id;
  };

  for (const item of updated) {
    if (!isTarget(item.menuItemId)) continue;
    if (remaining <= 0) break;
    const qty = Number(item.quantity || 0);
    if (qty <= 0) continue;
    const base = Number(item.unitPrice || 0) || 0;
    const freeQty = Math.min(qty, remaining);
    remaining -= freeQty;
    const chargedQty = Math.max(0, qty - freeQty);
    item.totalPrice = chargedQty * base;
    if (freeQty >= qty) item.unitPrice = 0;
  }

  return updated;
}

function computeDiscountForAction(itemsData, itemsWithMenu, action, ctx) {
  const type = action.type === "percent" ? "percent" : "fixed";
  const amount = Number(action.amount || 0);
  if (amount <= 0) return 0;

  let eligibleSubtotal = 0;
  if (action.scope === "order" || !action.scope) {
    eligibleSubtotal = itemsData.reduce((s, x) => s + Number(x.totalPrice || 0), 0);
  } else if (action.scope === "category") {
    eligibleSubtotal = itemsData.reduce((s, x) => {
      const found = itemsWithMenu.find((m) => m.item.menuItemId === x.menuItemId);
      if (found?.menuItem?.categoryId === action.targetId) {
        return s + Number(x.totalPrice || 0);
      }
      return s;
    }, 0);
  } else if (action.scope === "item") {
    eligibleSubtotal = itemsData
      .filter((x) => x.menuItemId === action.targetId)
      .reduce((s, x) => s + Number(x.totalPrice || 0), 0);
  }

  if (eligibleSubtotal <= 0) return 0;
  let discount = type === "percent" ? (eligibleSubtotal * amount) / 100 : amount;
  if (discount > eligibleSubtotal) discount = eligibleSubtotal;
  return discount;
}

async function applyPricingRules({ itemsWithMenu, itemsData, rules, ctx }) {
  let workingItems = itemsData.map((x) => ({ ...x }));
  let ruleDiscount = 0;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!ruleMatches(rule, ctx)) continue;

    const matchedQty = matchedQtyForRule(rule, ctx);

    for (const action of rule.actions.freeItems || []) {
      workingItems = applyFreeItems(workingItems, itemsWithMenu, action, matchedQty);
    }

    for (const action of rule.actions.discounts || []) {
      ruleDiscount += computeDiscountForAction(workingItems, itemsWithMenu, action, ctx);
    }

    for (const action of rule.actions.addItems || []) {
      const qty = Number(action.qty || 0);
      if (!action.itemId || qty <= 0) continue;
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: action.itemId },
        include: { category: true },
      });
      if (!menuItem) continue;
      const base = Number(menuItem.basePrice || 0);
      const unit = action.free ? 0 : base;
      const total = unit * qty;
      workingItems.push({
        menuItemId: menuItem.id,
        quantity: qty,
        notes: action.note || "",
        guest: Number(action.guest || 1),
        unitPrice: unit,
        totalPrice: total,
      });
      itemsWithMenu.push({
        item: { menuItemId: menuItem.id, quantity: qty },
        menuItem,
      });
    }

    if (rule.applyMode === "first") break;
  }

  return { itemsData: workingItems, ruleDiscount };
}

function applyPrintRules(order, settings, rules, ctx) {
  const receiptOverrides = {};
  const kitchenOverrides = {
    groupByGuest: true,
    guestSeparator: true,
    itemLabelOverrides: {},
  };

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!ruleMatches(rule, ctx)) continue;

    const print = rule.actions.print || {};
    if (print.receipt && typeof print.receipt === "object") {
      Object.assign(receiptOverrides, print.receipt);
    }
    if (print.kitchen && typeof print.kitchen === "object") {
      if (typeof print.kitchen.groupByGuest === "boolean") {
        kitchenOverrides.groupByGuest = print.kitchen.groupByGuest;
      }
      if (typeof print.kitchen.guestSeparator === "boolean") {
        kitchenOverrides.guestSeparator = print.kitchen.guestSeparator;
      }
      if (Array.isArray(print.kitchen.itemLabelOverrides)) {
        print.kitchen.itemLabelOverrides.forEach((x) => {
          if (x.itemId && x.label) kitchenOverrides.itemLabelOverrides[x.itemId] = x.label;
        });
      }
    }

    if (rule.applyMode === "first") break;
  }

  return { receiptOverrides, kitchenOverrides };
}

module.exports = {
  normalizeRules,
  applyPricingRules,
  applyPrintRules,
};
