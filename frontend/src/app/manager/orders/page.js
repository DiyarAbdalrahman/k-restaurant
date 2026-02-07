"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { resolveMediaUrl } from "@/lib/media";

const ROLE_ALLOWED = new Set(["admin", "manager"]);

function isoDateOnly(d) {
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

function formatGBP(n) {
  const x = Number(n || 0);
  return `£${x.toFixed(2)}`;
}

export default function ManagerOrdersPage() {
  const { settings } = useSettings();
  const logo = resolveMediaUrl(settings?.logoUrl) || "/logo.png";
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [from, setFrom] = useState(isoDateOnly(addDays(startOfToday(), -30)));
  const [to, setTo] = useState(isoDateOnly(new Date()));
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(200);
  const [showDeleted, setShowDeleted] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, from, to, status, limit, showDeleted]);

  async function loadHistory() {
    try {
      setLoading(true);
      setMessage("");
      const res = await api.get("/orders/history", {
        params: {
          from,
          to,
          status,
          limit,
          q: q.trim(),
          includeDeleted: showDeleted ? "true" : "false",
        },
      });
      setOrders(res.data || []);
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.message || "Failed to load order history";
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  async function deleteOrder(orderId) {
    const ok = window.confirm(
      "Delete this order permanently? This removes it from history and sales."
    );
    if (!ok) return;
    try {
      await api.delete(`/orders/${orderId}`);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (e) {
      console.error(e);
      alert("Failed to delete order");
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  const rows = useMemo(() => orders || [], [orders]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading order history...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
        <div className="px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Kurda Restaurant" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-lg font-bold">Order History</div>
              <div className="text-[11px] text-slate-400">
                {user.fullName} • {user.role}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/manager/reports" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Reports</a>
            <a href="/manager/menu" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Menu</a>
            <a href="/manager/tables" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Tables</a>
            <a href="/manager/users" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Users</a>
            <a href="/manager/settings" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Settings</a>
            <a href="/manager/promotions" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Promotions</a>
            <a href="/pos" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">POS</a>
            <button onClick={logout} className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500">Logout</button>
          </div>
        </div>
        {message && (
          <div className="px-4 md:px-6 pb-3 text-xs text-amber-300">
            {message}
          </div>
        )}
      </header>

      <div className="px-4 md:px-6 py-5 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          <div className="lg:col-span-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[10px] text-slate-400 uppercase">From</div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-transparent outline-none text-sm"
            />
          </div>
          <div className="lg:col-span-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[10px] text-slate-400 uppercase">To</div>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-transparent outline-none text-sm"
            />
          </div>
          <div className="lg:col-span-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[10px] text-slate-400 uppercase">Status</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-transparent outline-none text-sm"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="sent_to_kitchen">Sent</option>
              <option value="in_progress">In Progress</option>
              <option value="ready">Ready</option>
              <option value="served">Served</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="lg:col-span-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[10px] text-slate-400 uppercase">Limit</div>
            <select
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full bg-transparent outline-none text-sm"
            >
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="300">300</option>
              <option value="500">500</option>
            </select>
          </div>
          <div className="lg:col-span-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[10px] text-slate-400 uppercase">Order ID</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadHistory();
              }}
              placeholder="Prefix"
              className="w-full bg-transparent outline-none text-sm"
            />
          </div>
          <label className="lg:col-span-2 flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
            <div className="col-span-3">Order</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Total</div>
            <div className="col-span-2">Cashier</div>
            <div className="col-span-1 text-right">Action</div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {rows.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-400">
                No orders in this range.
              </div>
            ) : (
              rows.map((o) => (
                <div
                  key={o.id}
                  className={[
                    "grid grid-cols-12 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] text-sm",
                    o.isDeleted ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <div className="col-span-3">
                    <div className="font-semibold">#{String(o.id).slice(0, 8)}</div>
                    <div className="text-xs text-white/60">{new Date(o.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="col-span-2 text-xs text-white/70">
                    {o.type === "dine_in" ? `Table ${o.table?.name || "?"}` : "Takeaway"}
                  </div>
                  <div className="col-span-2 text-xs text-white/70">{o.status}</div>
                  <div className="col-span-2 text-right font-semibold">
                    {formatGBP(o.total)}
                  </div>
                  <div className="col-span-2 text-xs text-white/70">
                    {o.openedByUser?.fullName || o.openedByUser?.username || "-"}
                  </div>
                  <div className="col-span-1 text-right">
                    {user.role === "admin" ? (
                      <button
                        onClick={() => deleteOrder(o.id)}
                        className={[
                          "px-2 py-1 text-[10px] rounded-lg",
                          "bg-red-600/80 hover:bg-red-600",
                        ].join(" ")}
                        type="button"
                      >
                        Delete
                      </button>
                    ) : (
                      <span className="text-[10px] text-white/30">—</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
