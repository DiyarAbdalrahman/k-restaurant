// src/app/manager/reports/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";

const ROLE_ALLOWED = new Set(["admin", "manager"]);

function formatGBP(n) {
  const x = Number(n || 0);
  return `£${x.toFixed(2)}`;
}

function isoDateOnly(d) {
  // yyyy-mm-dd
  const pad = (v) => String(v).padStart(2, "0");
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-full text-xs font-semibold border transition",
        active
          ? "bg-red-600 text-white border-red-500 shadow-sm"
          : "bg-white/5 text-slate-200 border-white/10 hover:bg-white/10",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      {sub ? (
        <div className="mt-1 text-xs text-slate-400">{sub}</div>
      ) : null}
    </div>
  );
}

function MiniBarChart({ points, valueKey = "net" }) {
  // Simple inline bars (no external libs)
  const values = points.map((p) => Number(p[valueKey] || 0));
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <div className="flex items-end gap-1 h-20 w-full">
      {points.slice(-30).map((p, idx) => {
        const v = Number(p[valueKey] || 0);
        const h = Math.round((Math.abs(v) / max) * 100);
        const isNeg = v < 0;
        return (
          <div
            key={idx}
            title={`${new Date(p.date).toLocaleString()} • ${formatGBP(v)}`}
            className={[
              "flex-1 rounded-sm",
              isNeg ? "bg-white/20" : "bg-red-500/70",
            ].join(" ")}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

export default function ManagerReportsPage() {
  const [user, setUser] = useState(null);

  // Tabs
  const [tab, setTab] = useState("overview"); // overview | items | staff | alerts

  // Range presets
  const [preset, setPreset] = useState("month"); // today | week | month | year | custom
  const [from, setFrom] = useState(isoDateOnly(addDays(startOfToday(), -30)));
  const [to, setTo] = useState(isoDateOnly(new Date()));

  // Filters
  const [method, setMethod] = useState("all"); // all | cash | card | split
  const [type, setType] = useState("all"); // all | dine_in | takeaway

  // Items filters
  const [itemSort, setItemSort] = useState("top"); // top | slow
  const [itemLimit, setItemLimit] = useState(20);
  const [itemQuery, setItemQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");

  // Data
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [slowAlerts, setSlowAlerts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  // Apply preset to from/to
  useEffect(() => {
    const today = startOfToday();
    if (preset === "today") {
      setFrom(isoDateOnly(today));
      setTo(isoDateOnly(new Date()));
    } else if (preset === "week") {
      setFrom(isoDateOnly(addDays(today, -6)));
      setTo(isoDateOnly(new Date()));
    } else if (preset === "month") {
      setFrom(isoDateOnly(addDays(today, -30)));
      setTo(isoDateOnly(new Date()));
    } else if (preset === "year") {
      setFrom(isoDateOnly(addDays(today, -365)));
      setTo(isoDateOnly(new Date()));
    }
  }, [preset]);

  // Auth gate
  useEffect(() => {
    const u = getUser();
    if (!u) {
      window.location.href = "/login";
      return;
    }
    if (!ROLE_ALLOWED.has(u.role)) {
      window.location.href = "/pos";
      return;
    }
    setUser(u);
  }, []);

  async function loadCategories() {
    try {
      const res = await api.get("/menu");
      // backend returns categories with items - we only need category list
      const cats = (res.data || []).map((c) => ({ id: c.id, name: c.name }));
      setCategories(cats);
    } catch (e) {
      // non-fatal
      console.error(e);
    }
  }

  async function loadSummary() {
    const res = await api.get("/reports/summary", {
      params: { from, to, method, type },
    });
    setSummary(res.data);
  }

  async function loadItems() {
    const res = await api.get("/reports/items", {
      params: {
        from,
        to,
        sort: itemSort,
        limit: itemLimit,
        q: itemQuery || "",
        categoryId,
        type,
      },
    });
    setItems(res.data || []);
  }

  async function loadAlerts() {
    const res = await api.get("/reports/slow-alerts", {
      params: { from, to, limit: 10 },
    });
    setSlowAlerts(res.data || []);
  }

  async function refreshAll() {
    try {
      setLoading(true);
      setMessage("");
      await Promise.all([loadCategories(), loadSummary(), loadItems(), loadAlerts()]);
    } catch (e) {
      console.error(e);
      setMessage("Failed to load reports (check backend logs).");
    } finally {
      setLoading(false);
    }
  }

  // Reload when filters/range change
  useEffect(() => {
    if (!user) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, from, to, method, type, itemSort, itemLimit, itemQuery, categoryId]);

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  const totals = summary?.totals || null;

  const methodRows = useMemo(() => {
    const rows = summary?.byMethod || [];
    return rows.map((r) => ({
      label: String(r.method || "").toUpperCase(),
      value: Number(r.net || 0),
    }));
  }, [summary]);

  const staffRows = useMemo(() => summary?.byStaff || [], [summary]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading manager reports...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* TOP BAR */}
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">Manager Reports</div>
              <div className="text-[11px] text-slate-400">
                {user.fullName} • {user.role}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500"
            >
              Logout
            </button>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="px-4 md:px-6 pb-3 flex flex-col gap-3">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            <Chip active={tab === "overview"} onClick={() => setTab("overview")}>
              Overview
            </Chip>
            <Chip active={tab === "items"} onClick={() => setTab("items")}>
              Items
            </Chip>
            <Chip active={tab === "staff"} onClick={() => setTab("staff")}>
              Staff
            </Chip>
            <Chip active={tab === "alerts"} onClick={() => setTab("alerts")}>
              Alerts
            </Chip>
          </div>

          {/* Range + Filters */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
            {/* Presets */}
            <div className="lg:col-span-4 flex flex-wrap gap-2">
              <Chip active={preset === "today"} onClick={() => setPreset("today")}>
                Today
              </Chip>
              <Chip active={preset === "week"} onClick={() => setPreset("week")}>
                7 Days
              </Chip>
              <Chip active={preset === "month"} onClick={() => setPreset("month")}>
                30 Days
              </Chip>
              <Chip active={preset === "year"} onClick={() => setPreset("year")}>
                12 Months
              </Chip>
              <Chip active={preset === "custom"} onClick={() => setPreset("custom")}>
                Custom
              </Chip>
            </div>

            {/* Custom dates */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                <div className="text-[10px] text-slate-400 uppercase">From</div>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPreset("custom");
                    setFrom(e.target.value);
                  }}
                  className="w-full bg-transparent outline-none text-sm"
                />
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                <div className="text-[10px] text-slate-400 uppercase">To</div>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPreset("custom");
                    setTo(e.target.value);
                  }}
                  className="w-full bg-transparent outline-none text-sm"
                />
              </div>
            </div>

            {/* Method + Type */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                <div className="text-[10px] text-slate-400 uppercase">Method</div>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full bg-transparent outline-none text-sm"
                >
                  <option value="all">All</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="split">Split</option>
                </select>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                <div className="text-[10px] text-slate-400 uppercase">Type</div>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-transparent outline-none text-sm"
                >
                  <option value="all">All</option>
                  <option value="dine_in">Dine In</option>
                  <option value="takeaway">Takeaway</option>
                </select>
              </div>
            </div>
          </div>

          {message ? (
            <div className="text-xs text-amber-300 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              {message}
            </div>
          ) : null}
        </div>
      </header>

      {/* CONTENT */}
      <div className="flex-1 px-4 md:px-6 py-5">
        {tab === "overview" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <StatCard label="Net Sales" value={formatGBP(totals?.net)} sub="Payments - refunds" />
              <StatCard label="Gross" value={formatGBP(totals?.gross)} sub="Payments only" />
              <StatCard label="Refunds" value={formatGBP(totals?.refunds)} sub="Refunds only" />
              <StatCard label="Orders" value={String(totals?.ordersCount || 0)} sub="Paid orders" />
              <StatCard label="Avg Order" value={formatGBP(totals?.avgOrder)} sub="Net / orders" />
            </div>

            {/* Charts + Breakdown */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
              <div className="xl:col-span-8 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-semibold">Daily Net Sales</div>
                    <div className="text-xs text-slate-400">Last 30 points shown</div>
                  </div>
                  <div className="text-xs text-slate-400">
                    Range: {from} → {to}
                  </div>
                </div>
                <MiniBarChart points={summary?.daily || []} valueKey="net" />
              </div>

              <div className="xl:col-span-4 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="text-sm font-semibold mb-3">Payment Methods (Net)</div>

                <div className="space-y-2">
                  {methodRows.length === 0 ? (
                    <div className="text-xs text-slate-400">No data</div>
                  ) : (
                    methodRows.map((r) => (
                      <div
                        key={r.label}
                        className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2"
                      >
                        <div className="text-xs text-slate-200 font-semibold">{r.label}</div>
                        <div className="text-xs text-white">{formatGBP(r.value)}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 text-sm font-semibold mb-2">Hourly Net (shape)</div>
                <MiniBarChart points={summary?.hourly || []} valueKey="net" />
              </div>
            </div>
          </div>
        )}

        {tab === "items" && (
          <div className="space-y-3">
            {/* Items controls */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex flex-col md:flex-row md:items-end gap-3 md:justify-between">
                <div>
                  <div className="text-sm font-semibold">Items Performance</div>
                  <div className="text-xs text-slate-400">
                    Top items = fastest. Slow items = lowest sold.
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Chip active={itemSort === "top"} onClick={() => setItemSort("top")}>
                    Top Items
                  </Chip>
                  <Chip active={itemSort === "slow"} onClick={() => setItemSort("slow")}>
                    Slow Items
                  </Chip>

                  <button
                    onClick={() => {
                      const rows = [
                        ["Item", "Category", "Qty", "Revenue"],
                        ...items.map((it) => [
                          it.name,
                          it.category,
                          String(it.qty),
                          String(it.revenue.toFixed(2)),
                        ]),
                      ];
                      downloadCSV(
                        `items_${from}_to_${to}.csv`,
                        rows
                      );
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-2">
                <div className="md:col-span-5 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                  <div className="text-[10px] text-slate-400 uppercase">Search item</div>
                  <input
                    value={itemQuery}
                    onChange={(e) => setItemQuery(e.target.value)}
                    placeholder="e.g. Qozi, Salad..."
                    className="w-full bg-transparent outline-none text-sm"
                  />
                </div>

                <div className="md:col-span-4 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                  <div className="text-[10px] text-slate-400 uppercase">Category</div>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm"
                  >
                    <option value="all">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                  <div className="text-[10px] text-slate-400 uppercase">Limit</div>
                  <select
                    value={String(itemLimit)}
                    onChange={(e) => setItemLimit(Number(e.target.value))}
                    className="w-full bg-transparent outline-none text-sm"
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="30">30</option>
                    <option value="50">50</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
              <div className="grid grid-cols-12 gap-0 px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
                <div className="col-span-6">Item</div>
                <div className="col-span-3">Category</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2 text-right">Revenue</div>
              </div>

              <div className="max-h-[65vh] overflow-y-auto">
                {items.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-400">
                    No data for this range.
                  </div>
                ) : (
                  items.map((it) => (
                    <div
                      key={it.id}
                      className="grid grid-cols-12 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03]"
                    >
                      <div className="col-span-6">
                        <div className="text-sm font-semibold">{it.name}</div>
                      </div>
                      <div className="col-span-3 text-xs text-slate-300">
                        {it.category}
                      </div>
                      <div className="col-span-1 text-right text-sm font-semibold">
                        {it.qty}
                      </div>
                      <div className="col-span-2 text-right text-sm font-semibold text-red-200">
                        {formatGBP(it.revenue)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "staff" && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <div className="text-sm font-semibold">Staff Performance (Net)</div>
              <div className="text-xs text-slate-400">
                Based on payments/refunds created by each user.
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
                <div className="col-span-8">Staff</div>
                <div className="col-span-4 text-right">Net</div>
              </div>

              <div className="max-h-[70vh] overflow-y-auto">
                {staffRows.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-400">No data.</div>
                ) : (
                  staffRows.map((r, idx) => (
                    <div
                      key={`${r.staff}-${idx}`}
                      className="grid grid-cols-12 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03]"
                    >
                      <div className="col-span-8 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div className="text-sm font-semibold">{r.staff}</div>
                      </div>
                      <div className="col-span-4 text-right text-sm font-semibold text-red-200">
                        {formatGBP(r.net)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "alerts" && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <div className="text-sm font-semibold">Slow-Mover Alerts</div>
              <div className="text-xs text-slate-400">
                Compares this period to the previous equal-length period.
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
                  Biggest drops
                </div>
                <div className="max-h-[70vh] overflow-y-auto">
                  {slowAlerts.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-400">
                      No alerts (or not enough history).
                    </div>
                  ) : (
                    slowAlerts.map((a) => (
                      <div
                        key={a.id}
                        className="px-4 py-3 border-b border-white/5 hover:bg-white/[0.03]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{a.name}</div>
                            <div className="text-xs text-slate-400">
                              Prev: {a.prevQty} • Now: {a.nowQty}
                            </div>
                          </div>
                          <div className="px-2 py-1 rounded-lg text-xs font-bold bg-red-600/20 border border-red-500/30 text-red-200">
                            -{a.dropPercent}%
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="text-sm font-semibold mb-2">Recommendations</div>
                <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
                  <li>Highlight slow items on POS as “Chef Special” for 1 week.</li>
                  <li>Create bundles (Main + Drink) to move slow items faster.</li>
                  <li>Train staff to recommend top-margin items during peak hours.</li>
                  <li>Run a small discount for slow items during off-peak times.</li>
                </ul>

                <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-xs text-slate-400 uppercase">Tip</div>
                  <div className="text-sm text-slate-200">
                    Use “Items → Slow Items” tab to see the full slow list with revenue.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-4 md:px-6 py-3 border-t border-white/10 text-xs text-slate-500">
        Restaurant POS • Manager Reports • Red/Black/White theme
      </footer>
    </div>
  );
}
