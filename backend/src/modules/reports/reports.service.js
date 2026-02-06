// src/modules/reports/reports.service.js
const prisma = require("../../db/prisma");
const { Prisma } = require("@prisma/client");

function parseDateOrNull(v) {
  if (!v) return null;
  // If date-only string (YYYY-MM-DD), parse in local time
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map((x) => Number(x));
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function normalizeRange({ from, to }) {
  const fromD = parseDateOrNull(from) || new Date(new Date().setHours(0, 0, 0, 0));
  const toD = parseDateOrNull(to) || new Date();
  return { from: fromD, to: endOfDay(toD) };
}

class ReportsService {
  async summary({ from, to, method = "all", type = "all" }) {
    const range = normalizeRange({ from, to });

    const typeCond = type !== "all" ? Prisma.sql`AND o.type = ${type}::"OrderType"` : Prisma.empty;
    const methodCond =
      method !== "all" ? Prisma.sql`AND p.method = ${method}::"PaymentMethod"` : Prisma.empty;

    // daily net revenue
    const daily = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          date_trunc('day', p."createdAt") AS bucket,
          SUM(CASE WHEN p.kind='payment' THEN p.amount ELSE 0 END)::float AS gross,
          SUM(CASE WHEN p.kind='refund' THEN p.amount ELSE 0 END)::float AS refunds,
          (SUM(CASE WHEN p.kind='payment' THEN p.amount ELSE 0 END)
          - SUM(CASE WHEN p.kind='refund' THEN p.amount ELSE 0 END))::float AS net
        FROM "Payment" p
        JOIN "Order" o ON o.id = p."orderId"
        WHERE p."createdAt" BETWEEN ${range.from} AND ${range.to}
          ${typeCond}
          ${methodCond}
        GROUP BY bucket
        ORDER BY bucket ASC
      `
    );

    // hourly net revenue
    const hourly = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          date_trunc('hour', p."createdAt") AS bucket,
          (SUM(CASE WHEN p.kind='payment' THEN p.amount ELSE 0 END)
          - SUM(CASE WHEN p.kind='refund' THEN p.amount ELSE 0 END))::float AS net
        FROM "Payment" p
        JOIN "Order" o ON o.id = p."orderId"
        WHERE p."createdAt" BETWEEN ${range.from} AND ${range.to}
          ${typeCond}
          ${methodCond}
        GROUP BY bucket
        ORDER BY bucket ASC
      `
    );

    // totals (gross/refunds/net)
    const totals = await prisma.payment.groupBy({
      by: ["kind"],
      where: {
        createdAt: { gte: range.from, lte: range.to },
        ...(method !== "all" ? { method } : {}),
        order: { ...(type !== "all" ? { type } : {}) },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const gross = Number(totals.find((t) => t.kind === "payment")?._sum.amount || 0);
    const refunds = Number(totals.find((t) => t.kind === "refund")?._sum.amount || 0);
    const net = gross - refunds;

    // orders count
    const distinctOrders = await prisma.payment.groupBy({
      by: ["orderId"],
      where: {
        createdAt: { gte: range.from, lte: range.to },
        order: { ...(type !== "all" ? { type } : {}) },
        ...(method !== "all" ? { method } : {}),
      },
      _count: { orderId: true },
    });
    const ordersCount = distinctOrders.length;
    const avgOrder = ordersCount ? net / ordersCount : 0;

    // split by method (net)
    const byMethod = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          p.method,
          (SUM(CASE WHEN p.kind='payment' THEN p.amount ELSE 0 END)
          - SUM(CASE WHEN p.kind='refund' THEN p.amount ELSE 0 END))::float AS net
        FROM "Payment" p
        JOIN "Order" o ON o.id = p."orderId"
        WHERE p."createdAt" BETWEEN ${range.from} AND ${range.to}
          ${typeCond}
          ${methodCond}
        GROUP BY p.method
        ORDER BY net DESC
      `
    );

    // staff performance (net by user)
    const byStaff = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          u."fullName" AS staff,
          (SUM(CASE WHEN p.kind='payment' THEN p.amount ELSE 0 END)
          - SUM(CASE WHEN p.kind='refund' THEN p.amount ELSE 0 END))::float AS net
        FROM "Payment" p
        JOIN "User" u ON u.id = p."createdBy"
        JOIN "Order" o ON o.id = p."orderId"
        WHERE p."createdAt" BETWEEN ${range.from} AND ${range.to}
          ${typeCond}
          ${methodCond}
        GROUP BY u."fullName"
        ORDER BY net DESC
      `
    );

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      totals: { gross, refunds, net, ordersCount, avgOrder },
      daily: (daily || []).map((r) => ({
        date: new Date(r.bucket).toISOString(),
        gross: Number(r.gross || 0),
        refunds: Number(r.refunds || 0),
        net: Number(r.net || 0),
      })),
      hourly: (hourly || []).map((r) => ({
        date: new Date(r.bucket).toISOString(),
        net: Number(r.net || 0),
      })),
      byMethod: (byMethod || []).map((r) => ({ method: r.method, net: Number(r.net || 0) })),
      byStaff: (byStaff || []).map((r) => ({ staff: r.staff, net: Number(r.net || 0) })),
    };
  }

  async items({ from, to, sort = "top", limit = 20, q = "", categoryId = "all", type = "all" }) {
    const range = normalizeRange({ from, to });
    const take = Math.max(1, Math.min(Number(limit) || 20, 100));
    const query = String(q || "").trim();

    const typeCond = type !== "all" ? Prisma.sql`AND o.type = ${type}::"OrderType"` : Prisma.empty;
    const catCond =
      categoryId !== "all" ? Prisma.sql`AND mi."categoryId" = ${categoryId}` : Prisma.empty;
    const queryCond =
      query ? Prisma.sql`AND mi.name ILIKE ${`%${query}%`}` : Prisma.empty;

    const rows = await prisma.$queryRaw(
      Prisma.sql`
        WITH paid_orders AS (
          SELECT DISTINCT p."orderId"
          FROM "Payment" p
          JOIN "Order" o ON o.id = p."orderId"
          WHERE p.kind = 'payment'
            AND p."createdAt" BETWEEN ${range.from} AND ${range.to}
            ${typeCond}
        )
        SELECT
          oi."menuItemId" AS id,
          SUM(oi.quantity)::float AS qty,
          SUM(oi."totalPrice")::float AS revenue
        FROM "OrderItem" oi
        JOIN paid_orders po ON po."orderId" = oi."orderId"
        JOIN "MenuItem" mi ON mi.id = oi."menuItemId"
        WHERE 1=1
          ${catCond}
          ${queryCond}
        GROUP BY oi."menuItemId"
        ORDER BY ${sort === "slow" ? Prisma.sql`qty ASC` : Prisma.sql`qty DESC`}
        LIMIT ${take}
      `
    );

    const ids = (rows || []).map((r) => r.id);
    const items = await prisma.menuItem.findMany({
      where: { id: { in: ids } },
      include: { category: true },
    });
    const map = new Map(items.map((i) => [i.id, i]));

    return (rows || []).map((r) => {
      const it = map.get(r.id);
      return {
        id: r.id,
        name: it?.name || "Unknown item",
        category: it?.category?.name || "",
        qty: Number(r.qty || 0),
        revenue: Number(r.revenue || 0),
      };
    });
  }

  // ✅ slow-mover alerts: compares this period vs previous same-length period
  async slowAlerts({ from, to, limit = 10 }) {
    const range = normalizeRange({ from, to });
    const ms = range.to.getTime() - range.from.getTime();
    const prevFrom = new Date(range.from.getTime() - ms);
    const prevTo = new Date(range.to.getTime() - ms);

    const curr = await prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: { order: { status: "paid", createdAt: { gte: range.from, lte: range.to } } },
      _sum: { quantity: true },
    });

    const prev = await prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: { order: { status: "paid", createdAt: { gte: prevFrom, lte: prevTo } } },
      _sum: { quantity: true },
    });

    const prevMap = new Map(prev.map((x) => [x.menuItemId, Number(x._sum.quantity || 0)]));
    const merged = curr.map((x) => {
      const nowQty = Number(x._sum.quantity || 0);
      const prevQty = prevMap.get(x.menuItemId) || 0;
      const drop = prevQty > 0 ? (prevQty - nowQty) / prevQty : 0;
      return { menuItemId: x.menuItemId, nowQty, prevQty, drop };
    });

    merged.sort((a, b) => b.drop - a.drop);

    const top = merged.slice(0, Math.max(1, Math.min(Number(limit) || 10, 50)));
    const ids = top.map((t) => t.menuItemId);

    const items = await prisma.menuItem.findMany({ where: { id: { in: ids } } });
    const map = new Map(items.map((i) => [i.id, i.name]));

    return top.map((t) => ({
      id: t.menuItemId,
      name: map.get(t.menuItemId) || "Unknown",
      nowQty: t.nowQty,
      prevQty: t.prevQty,
      dropPercent: Math.round(t.drop * 100),
    }));
  }
}

const reportsService = new ReportsService();
module.exports = { reportsService };
