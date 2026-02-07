// src/app/manager/reports/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { resolveMediaUrl } from "@/lib/media";

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

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0 (Sun) - 6 (Sat)
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfYear(d) {
  const x = new Date(d);
  x.setMonth(0, 1);
  x.setHours(0, 0, 0, 0);
  return x;
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

function printSectionPdf(title, rows, logoUrl, brandName) {
  const html = `
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; color: #111; }
          h2 { margin: 0 0 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #ddd; padding: 6px; font-size: 12px; text-align: left; }
          th { background: #f2f2f2; }
        </style>
      </head>
      <body>
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="${logoUrl || "/logo.png"}" alt="Logo" style="width:48px;height:48px;object-fit:cover;border-radius:8px;" />
          <div>
            <h2 style="margin:0;">${title}</h2>
            <div style="font-size:12px;color:#555;">${brandName || "Kurda Restaurant"}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>${rows[0].map((h) => `<th>${h}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
        <script>window.print();</script>
      </body>
    </html>
  `;
  const win = window.open("", "report_pdf", "width=800,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
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
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="w-2 h-2 rounded-full bg-red-500/70" />
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
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

function AreaChart({ points, valueKey = "net" }) {
  const data = (points || []).slice(-30);
  if (data.length === 0) return <div className="text-xs text-slate-400">No data</div>;
  const values = data.map((p) => Number(p[valueKey] || 0));
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const width = 600;
  const height = 120;
  const step = width / (data.length - 1 || 1);
  const pointsStr = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  const areaStr = `0,${height} ${pointsStr} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28">
      <polyline
        points={pointsStr}
        fill="none"
        stroke="#ef4444"
        strokeWidth="3"
      />
      <polygon points={areaStr} fill="rgba(239,68,68,0.2)" />
    </svg>
  );
}

function StackedBars({ points }) {
  const data = (points || []).slice(-14);
  if (data.length === 0) return <div className="text-xs text-slate-400">No data</div>;
  const max = Math.max(
    1,
    ...data.map((p) => Number(p.gross || 0) + Number(p.refunds || 0))
  );
  return (
    <div className="flex items-end gap-2 h-28 w-full">
      {data.map((p, idx) => {
        const gross = Number(p.gross || 0);
        const refunds = Number(p.refunds || 0);
        const grossH = Math.round((gross / max) * 100);
        const refundH = Math.round((refunds / max) * 100);
        return (
          <div key={idx} className="flex-1 flex flex-col justify-end gap-1">
            <div
              className="w-full rounded-sm bg-red-500/70"
              style={{ height: `${grossH}%` }}
              title={`Gross: ${formatGBP(gross)}`}
            />
            <div
              className="w-full rounded-sm bg-white/20"
              style={{ height: `${refundH}%` }}
              title={`Refunds: ${formatGBP(refunds)}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function Donut({ data }) {
  const total = data.reduce((s, x) => s + Number(x.value || 0), 0) || 1;
  const segments = data.map((d) => ({
    ...d,
    pct: (Number(d.value || 0) / total) * 100,
  }));
  let acc = 0;
  const colors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"];
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 42 42" className="w-24 h-24">
        {segments.map((s, i) => {
          const dash = `${s.pct} ${100 - s.pct}`;
          const offset = 25 - acc;
          acc += s.pct;
          return (
            <circle
              key={i}
              cx="21"
              cy="21"
              r="15.9"
              fill="transparent"
              stroke={colors[i % colors.length]}
              strokeWidth="8"
              strokeDasharray={dash}
              strokeDashoffset={offset}
            />
          );
        })}
        <circle cx="21" cy="21" r="10" fill="#0b0b0b" />
      </svg>
      <div className="space-y-1 text-xs text-slate-300">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: colors[i % colors.length] }}
            />
            {s.label}: {formatGBP(s.value)}
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ rows }) {
  if (!rows || rows.length === 0) return <div className="text-xs text-slate-400">No data</div>;
  const max = Math.max(1, ...rows.map((r) => Number(r.value || 0)));
  return (
    <div className="space-y-2">
      {rows.slice(0, 5).map((r, idx) => (
        <div key={idx}>
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>{r.label}</span>
            <span>{formatGBP(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-red-500/70"
              style={{ width: `${(Number(r.value || 0) / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ManagerReportsPage() {
  const { settings } = useSettings();
  const logo = resolveMediaUrl(settings?.logoUrl) || "/logo.png";
  const [user, setUser] = useState(null);

  // Tabs
  const [tab, setTab] = useState("overview"); // overview | items | staff | alerts

  // Range presets
  const [preset, setPreset] = useState("month"); // today | week | month | year | custom
  const [from, setFrom] = useState(isoDateOnly(addDays(startOfToday(), -30)));
  const [to, setTo] = useState(isoDateOnly(new Date()));

  // Filters
  const [method, setMethod] = useState("all"); // all | cash | card
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
    const now = new Date();
    if (preset === "today") {
      setFrom(isoDateOnly(today));
      setTo(isoDateOnly(now));
    } else if (preset === "week") {
      setFrom(isoDateOnly(startOfWeek(today)));
      setTo(isoDateOnly(now));
    } else if (preset === "month") {
      setFrom(isoDateOnly(startOfMonth(today)));
      setTo(isoDateOnly(now));
    } else if (preset === "year") {
      setFrom(isoDateOnly(startOfYear(today)));
      setTo(isoDateOnly(now));
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
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        "Failed to load reports (check backend logs).";
      setMessage(msg);
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

  function exportOverviewCsv() {
    const rows = [
      ["Metric", "Value"],
      ["Net Sales", formatGBP(totals?.net)],
      ["Gross", formatGBP(totals?.gross)],
      ["Refunds", formatGBP(totals?.refunds)],
      ["Orders", String(totals?.ordersCount || 0)],
      ["Avg Order", formatGBP(totals?.avgOrder)],
    ];
    const daily = [
      ["Date", "Gross", "Refunds", "Net"],
      ...(summary?.daily || []).map((d) => [d.date, d.gross, d.refunds, d.net]),
    ];
    const methods = [
      ["Method", "Net"],
      ...(summary?.byMethod || []).map((m) => [m.method, m.net]),
    ];
    downloadCSV(`overview_${from}_to_${to}.csv`, rows.concat([[], ...daily, [], ...methods]));
  }

  function exportOverviewPdf() {
    const rows = [
      ["Metric", "Value"],
      ["Net Sales", formatGBP(totals?.net)],
      ["Gross", formatGBP(totals?.gross)],
      ["Refunds", formatGBP(totals?.refunds)],
      ["Orders", String(totals?.ordersCount || 0)],
      ["Avg Order", formatGBP(totals?.avgOrder)],
    ];
    printSectionPdf(`Overview ${from} → ${to}`, rows, logo, settings?.brandName);
  }

  function exportStaffCsv() {
    const rows = [
      ["Staff", "Net"],
      ...(staffRows || []).map((s) => [s.staff, s.net]),
    ];
    downloadCSV(`staff_${from}_to_${to}.csv`, rows);
  }

  function exportStaffPdf() {
    const rows = [
      ["Staff", "Net"],
      ...(staffRows || []).map((s) => [s.staff, s.net]),
    ];
    printSectionPdf(`Staff ${from} → ${to}`, rows, logo, settings?.brandName);
  }

  function exportAlertsCsv() {
    const rows = [
      ["Item", "Prev Qty", "Now Qty", "Drop %"],
      ...(slowAlerts || []).map((a) => [a.name, a.prevQty, a.nowQty, a.dropPercent]),
    ];
    downloadCSV(`alerts_${from}_to_${to}.csv`, rows);
  }

  function exportAlertsPdf() {
    const rows = [
      ["Item", "Prev Qty", "Now Qty", "Drop %"],
      ...(slowAlerts || []).map((a) => [a.name, a.prevQty, a.nowQty, a.dropPercent]),
    ];
    printSectionPdf(`Alerts ${from} → ${to}`, rows, logo, settings?.brandName);
  }

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading manager reports...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-x-hidden">
      {/* TOP BAR */}
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Kurda Restaurant" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">Manager Reports</div>
              <div className="text-[11px] text-slate-400">
                {user.fullName} • {user.role}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {tab === "overview" && (
              <>
                <button
                  onClick={exportOverviewCsv}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                >
                  Export CSV
                </button>
                <button
                  onClick={exportOverviewPdf}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                >
                  Export PDF
                </button>
              </>
            )}
            {tab === "staff" && (
              <>
                <button
                  onClick={exportStaffCsv}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                >
                  Export CSV
                </button>
                <button
                  onClick={exportStaffPdf}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                >
                  Export PDF
                </button>
              </>
            )}
            {tab === "alerts" && (
              <>
                <button
                  onClick={exportAlertsCsv}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                >
                  Export CSV
                </button>
                <button
                  onClick={exportAlertsPdf}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                >
                  Export PDF
                </button>
              </>
            )}
            <a
              href="/manager/menu"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Menu
            </a>
            <a
              href="/manager/orders"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Orders
            </a>
            <a
              href="/manager/tables"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Tables
            </a>
            <a
              href="/manager/users"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Users
            </a>
            <a
              href="/manager/settings"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Settings
            </a>
            <a
              href="/manager/promotions"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Promotions
            </a>
            <a
              href="/pos"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              POS
            </a>
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
        <div className="px-4 md:px-6 pb-3">
          <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-3 md:p-4">
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 mt-3">
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
        </div>
      </header>

      {/* CONTENT */}
      <div className="flex-1 px-4 md:px-6 py-5">
        {tab === "overview" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <StatCard label="Net Sales" value={formatGBP(totals?.net)} sub="Payments - refunds" />
              <StatCard label="Gross" value={formatGBP(totals?.gross)} sub="Payments only" />
              <StatCard label="Refunds" value={formatGBP(totals?.refunds)} sub="Refunds only" />
              <StatCard label="Orders" value={String(totals?.ordersCount || 0)} sub="Paid orders" />
              <StatCard label="Avg Order" value={formatGBP(totals?.avgOrder)} sub="Net / orders" />
            </div>

            {/* Charts + Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-8 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-semibold">Net Sales Trend</div>
                    <div className="text-xs text-slate-400">Last 30 days</div>
                  </div>
                  <div className="text-xs text-slate-400">
                    Range: {from} → {to}
                  </div>
                </div>
                <AreaChart points={summary?.daily || []} valueKey="net" />
                <div className="mt-2 text-[11px] text-slate-500">
                  Range uses local time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                </div>
              </div>

              <div className="lg:col-span-4 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="text-sm font-semibold mb-3">Payment Mix</div>
                <Donut
                  data={methodRows.map((r) => ({ label: r.label, value: r.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-7 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="text-sm font-semibold mb-2">Gross vs Refunds</div>
                <StackedBars points={summary?.daily || []} />
              </div>
              <div className="lg:col-span-5 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="text-sm font-semibold mb-2">Top 5 Items</div>
                <HorizontalBars
                  rows={(items || []).slice(0, 5).map((i) => ({
                    label: i.name,
                    value: i.revenue,
                  }))}
                />
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
                      printSectionPdf(`Items ${from} → ${to}`, rows, logo, settings?.brandName);
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                  >
                    Export PDF
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
              <div className="hidden sm:grid grid-cols-12 gap-0 px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
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
                      className="grid grid-cols-1 sm:grid-cols-12 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] gap-1 sm:gap-0"
                    >
                      <div className="sm:col-span-6">
                        <div className="sm:hidden text-[10px] uppercase text-slate-500">Item</div>
                        <div className="text-sm font-semibold">{it.name}</div>
                      </div>
                      <div className="sm:col-span-3 text-xs text-slate-300">
                        <div className="sm:hidden text-[10px] uppercase text-slate-500">Category</div>
                        {it.category}
                      </div>
                      <div className="sm:col-span-1 sm:text-right text-sm font-semibold">
                        <div className="sm:hidden text-[10px] uppercase text-slate-500">Qty</div>
                        {it.qty}
                      </div>
                      <div className="sm:col-span-2 sm:text-right text-sm font-semibold text-red-200">
                        <div className="sm:hidden text-[10px] uppercase text-slate-500">Revenue</div>
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
              <div className="hidden sm:grid grid-cols-12 px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
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
                      className="grid grid-cols-1 sm:grid-cols-12 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] gap-1 sm:gap-0"
                    >
                      <div className="sm:col-span-8 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="sm:hidden text-[10px] uppercase text-slate-500">Staff</div>
                          <div className="text-sm font-semibold">{r.staff}</div>
                        </div>
                      </div>
                      <div className="sm:col-span-4 sm:text-right text-sm font-semibold text-red-200">
                        <div className="sm:hidden text-[10px] uppercase text-slate-500">Net</div>
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
