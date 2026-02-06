"use client";

import { useEffect, useMemo, useState, Children } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { kitchenSocket } from "@/lib/socket";
import { useSettings } from "@/lib/settings";

const STATUS_NEW = "sent_to_kitchen";
const STATUS_COOKING = "in_progress";
const STATUS_READY = "ready";

export default function KitchenPage() {
  const { settings } = useSettings();
  const logo = settings?.logoUrl || "/logo.png";
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [draggedOrderId, setDraggedOrderId] = useState(null);
  const [flashIds, setFlashIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // UI controls
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState("all"); // all | new | cooking | ready
  const [typeFilter, setTypeFilter] = useState("all"); // all | dine_in | takeaway
  const [autoHideReady, setAutoHideReady] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundLoud, setSoundLoud] = useState(false);
  const [autoHideMinutes, setAutoHideMinutes] = useState(10);
  const [tableFilter, setTableFilter] = useState("all");
  const [compactMode, setCompactMode] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(45);
  const [showAgeBands, setShowAgeBands] = useState(true);

  // Toasts
  const toast = useToasts();

  useEffect(() => {
    const u = getUser();
    if (!u) {
      window.location.href = "/login";
      return;
    }
    setUser(u);
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (typeof settings.kitchenSoundEnabled === "boolean") {
      setSoundEnabled(settings.kitchenSoundEnabled);
    }
    if (typeof settings.kitchenLoudSound === "boolean") {
      setSoundLoud(settings.kitchenLoudSound);
    }
    if (typeof settings.kitchenAutoHideReadyMinutes === "number") {
      setAutoHideMinutes(settings.kitchenAutoHideReadyMinutes);
    }
    if (typeof settings.kitchenAutoRefreshSeconds === "number") {
      setRefreshSeconds(settings.kitchenAutoRefreshSeconds);
    }
    if (typeof settings.kitchenShowAgeBands === "boolean") {
      setShowAgeBands(settings.kitchenShowAgeBands);
    }
  }, [settings]);

  // Socket: update without polling
  useEffect(() => {
    const onUpdated = (updatedOrder) => {
      if (!updatedOrder?.id) return;

      setOrders((prev) => {
        // Keep only kitchen statuses
        if (![STATUS_NEW, STATUS_COOKING, STATUS_READY].includes(updatedOrder.status)) {
          return prev.filter((o) => o.id !== updatedOrder.id);
        }

        const idx = prev.findIndex((o) => o.id === updatedOrder.id);
        if (idx === -1) {
          if (updatedOrder.status === STATUS_NEW) {
            setFlashIds((curr) =>
              curr.includes(updatedOrder.id) ? curr : [...curr, updatedOrder.id]
            );
            playBeep({ enabled: soundEnabled, loud: soundLoud });
            setTimeout(() => {
              setFlashIds((curr) => curr.filter((id) => id !== updatedOrder.id));
            }, 2000);
          }
          return [updatedOrder, ...prev];
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...updatedOrder };
        return copy;
      });
    };

    kitchenSocket.on("order:updated", onUpdated);
    kitchenSocket.on("connect_error", () => {
      toast.info("Kitchen live updates reconnecting...");
    });

    return () => {
      kitchenSocket.off("order:updated", onUpdated);
      kitchenSocket.off("connect_error");
    };
  }, []);

  // Fallback polling (in case socket drops)
  useEffect(() => {
    if (!refreshSeconds || refreshSeconds <= 0) return;
    const t = setInterval(() => {
      loadOrders();
    }, Math.max(10, refreshSeconds) * 1000);
    return () => clearInterval(t);
  }, [refreshSeconds]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  async function loadOrders() {
    try {
      setLoading(true);
      const res = await api.get("/orders");
      const filtered = (res.data || []).filter((o) =>
        [STATUS_NEW, STATUS_COOKING, STATUS_READY].includes(o.status)
      );
      setOrders(filtered);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load kitchen orders");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  // ----- DRAG & DROP -----
  function onDragStart(evt, orderId) {
    setDraggedOrderId(orderId);
    evt.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(evt) {
    evt.preventDefault();
  }

  async function onDrop(evt, newStatus) {
    evt.preventDefault();
    if (!draggedOrderId) return;

    const id = draggedOrderId;
    setDraggedOrderId(null);

    // Optimistic update (feels instant)
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
    );

    try {
      setUpdatingId(id);
      const res = await api.patch(`/orders/${id}/status`, { status: newStatus });

      // update with server response (authoritative)
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...res.data } : o))
      );

      toast.success(
        newStatus === STATUS_COOKING
          ? "Moved to Cooking"
          : newStatus === STATUS_READY
          ? "Marked Ready"
          : "Moved to New"
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to update order status");
      // fallback: reload to correct UI
      loadOrders();
    } finally {
      setUpdatingId(null);
    }
  }

  // Quick status buttons (tablet friendly)
  async function setStatus(orderId, status) {
    // optimistic
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    try {
      setUpdatingId(orderId);
      const res = await api.patch(`/orders/${orderId}/status`, { status });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...res.data } : o)));
    } catch (e) {
      console.error(e);
      toast.error("Failed to change status");
      loadOrders();
    } finally {
      setUpdatingId(null);
    }
  }

  // helpers to split columns
  const newOrders = useMemo(() => orders.filter((o) => o.status === STATUS_NEW), [orders]);
  const cookingOrders = useMemo(
    () => orders.filter((o) => o.status === STATUS_COOKING),
    [orders]
  );
  const readyOrders = useMemo(() => orders.filter((o) => o.status === STATUS_READY), [orders]);

  const normalizedSearch = search.trim().toLowerCase();

  function filterOrders(arr) {
    if (!normalizedSearch) return arr;
    return arr.filter((o) => {
      const id = String(o.id || "").toLowerCase();
      const table = String(o.table?.name || "").toLowerCase();
      const items = (o.items || [])
        .map((it) => String(it.menuItem?.name || "").toLowerCase())
        .join(" ");
      return id.includes(normalizedSearch) || table.includes(normalizedSearch) || items.includes(normalizedSearch);
    });
  }

  function applyTypeFilter(arr) {
    if (typeFilter === "all") return arr;
    return arr.filter((o) => o.type === typeFilter);
  }

  function applyTableFilter(arr) {
    if (tableFilter === "all") return arr;
    if (tableFilter === "takeaway") return arr.filter((o) => o.type !== "dine_in");
    return arr.filter((o) => String(o.table?.name || "") === tableFilter);
  }

  function applyAutoHideReady(arr) {
    if (!autoHideReady) return arr;
      return arr.filter((o) => {
        if (o.status !== STATUS_READY) return true;
        const created = new Date(o.createdAt).getTime();
        return now - created <= autoHideMinutes * 60 * 1000;
      });
  }

  const filteredNew = applyTableFilter(applyTypeFilter(filterOrders(newOrders)));
  const filteredCooking = applyTableFilter(applyTypeFilter(filterOrders(cookingOrders)));
  const filteredReady = applyAutoHideReady(applyTableFilter(applyTypeFilter(filterOrders(readyOrders))));

  const tableOptions = useMemo(() => {
    const names = new Set();
    for (const o of orders) {
      if (o.type === "dine_in" && o.table?.name) names.add(o.table.name);
    }
    return Array.from(names).sort();
  }, [orders]);

  // Focus view for smaller screens (tablet)
  const columnsToShow =
    focus === "new" ? ["new"] : focus === "cooking" ? ["cooking"] : focus === "ready" ? ["ready"] : ["new", "cooking", "ready"];

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading kitchen screen...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <ToastStack toasts={toast.toasts} remove={toast.remove} />

      {/* TOP BAR */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Kurda Restaurant" className="w-full h-full object-cover" />
            </div>

            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight">Kitchen Display</div>
              <div className="text-xs text-white/60 truncate">
                Drag tickets or use the quick buttons • New → Cooking → Ready
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="hidden md:block w-80">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order / table / item..."
                className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-2 text-sm outline-none focus:border-red-500/60"
              />
            </div>

            <div className="hidden md:flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                />
                Sound
              </label>
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={soundLoud}
                  onChange={(e) => setSoundLoud(e.target.checked)}
                  disabled={!soundEnabled}
                />
                Loud
              </label>
            </div>

            {/* User */}
            {user && (
              <div className="hidden lg:block text-right">
                <div className="text-sm font-medium">{user.fullName}</div>
                <div className="text-xs text-white/60">{user.role}</div>
              </div>
            )}

            <button
              onClick={logout}
              className="px-4 py-2 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.98] transition text-xs font-semibold"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Mobile/tablet controls row */}
        <div className="px-5 pb-4 flex flex-col md:hidden gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order / table / item..."
            className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-2 text-sm outline-none focus:border-red-500/60"
          />

          <div className="grid grid-cols-4 gap-2">
            <TabButton active={focus === "all"} onClick={() => setFocus("all")} label="All" />
            <TabButton
              active={focus === "new"}
              onClick={() => setFocus("new")}
              label={`New (${filteredNew.length})`}
            />
            <TabButton
              active={focus === "cooking"}
              onClick={() => setFocus("cooking")}
              label={`Cooking (${filteredCooking.length})`}
            />
            <TabButton
              active={focus === "ready"}
              onClick={() => setFocus("ready")}
              label={`Ready (${filteredReady.length})`}
            />
          </div>
        </div>
        <div className="px-5 pb-4 hidden md:flex items-center gap-3 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-xs outline-none focus:border-red-500/60"
          >
            <option value="all">All types</option>
            <option value="dine_in">Dine In</option>
            <option value="takeaway">Takeaway</option>
          </select>

          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-xs outline-none focus:border-red-500/60"
          >
            <option value="all">All tables</option>
            <option value="takeaway">Takeaway</option>
            {tableOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={autoHideReady}
              onChange={(e) => setAutoHideReady(e.target.checked)}
            />
            Auto-hide Ready after 10m
          </label>

          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={compactMode}
              onChange={(e) => setCompactMode(e.target.checked)}
            />
            Compact mode
          </label>
        </div>
      </header>

      {/* MAIN GRID */}
      <main className="p-4 grid gap-4"
        style={{
          gridTemplateColumns:
            columnsToShow.length === 1 ? "1fr" : "repeat(3, minmax(0, 1fr))",
        }}
      >
        {/* COLUMN: NEW */}
        {columnsToShow.includes("new") && (
          <Column
            title="New"
            subtitle="Sent from POS"
            badge={filteredNew.length}
            tone="new"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, STATUS_NEW)}
          >
            {filteredNew.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onDragStart={onDragStart}
                updating={updatingId === order.id}
                setStatus={setStatus}
                flash={flashIds.includes(order.id)}
                now={now}
                compact={compactMode}
                showAgeBands={showAgeBands}
              />
            ))}
          </Column>
        )}

        {/* COLUMN: COOKING */}
        {columnsToShow.includes("cooking") && (
          <Column
            title="Cooking"
            subtitle="In progress"
            badge={filteredCooking.length}
            tone="cooking"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, STATUS_COOKING)}
          >
            {filteredCooking.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onDragStart={onDragStart}
                updating={updatingId === order.id}
                setStatus={setStatus}
                flash={flashIds.includes(order.id)}
                now={now}
                compact={compactMode}
                showAgeBands={showAgeBands}
              />
            ))}
          </Column>
        )}

        {/* COLUMN: READY */}
        {columnsToShow.includes("ready") && (
          <Column
            title="Ready"
            subtitle="Ready to serve"
            badge={filteredReady.length}
            tone="ready"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, STATUS_READY)}
          >
            {filteredReady.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onDragStart={onDragStart}
                updating={updatingId === order.id}
                setStatus={setStatus}
                flash={flashIds.includes(order.id)}
                now={now}
                compact={compactMode}
                showAgeBands={showAgeBands}
              />
            ))}
          </Column>
        )}
      </main>
    </div>
  );
}

// -----------------------------
// Column (modern, brand colors)
// -----------------------------
function Column({ title, subtitle, badge, tone, children, onDragOver, onDrop }) {
  const toneStyles =
    tone === "new"
      ? "border-red-500/30 bg-red-500/10"
      : tone === "cooking"
      ? "border-white/10 bg-white/5"
      : "border-emerald-500/25 bg-emerald-500/10";

  const pill =
    tone === "new"
      ? "bg-red-500/15 border-red-500/30 text-red-100"
      : tone === "cooking"
      ? "bg-white/10 border-white/15 text-white"
      : "bg-emerald-500/15 border-emerald-500/30 text-emerald-100";

  return (
    <div
      className={`rounded-3xl border ${toneStyles} overflow-hidden flex flex-col min-h-[70vh]`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="px-4 py-3 border-b border-white/10 bg-black/20">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">{title}</div>
            <div className="text-[11px] text-white/60">{subtitle}</div>
          </div>
          <div className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${pill}`}>
            {badge}
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {Children.count(children) > 0 ? (
          children
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/60">
            No orders here
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------
// Ticket Card (modern + quick actions)
// -----------------------------
function OrderCard({ order, onDragStart, updating, setStatus, flash, now, compact, showAgeBands }) {
  const itemCount = (order.items || []).reduce((sum, it) => sum + Number(it.quantity || 0), 0);
  const createdMs = new Date(order.createdAt || Date.now()).getTime();
  const ageMin = Math.max(0, Math.floor(((now || Date.now()) - createdMs) / 60000));

  const headerChip =
    order.status === STATUS_NEW
      ? "bg-red-500/15 border-red-500/30 text-red-100"
      : order.status === STATUS_COOKING
      ? "bg-white/10 border-white/15 text-white"
      : "bg-emerald-500/15 border-emerald-500/30 text-emerald-100";

  const statusLabel =
    order.status === STATUS_NEW ? "NEW" : order.status === STATUS_COOKING ? "COOKING" : "READY";

  const ageBand =
    !showAgeBands
      ? ""
      : ageMin >= 20
      ? "ring-2 ring-red-500/40"
      : ageMin >= 10
      ? "ring-2 ring-amber-400/40"
      : ageMin >= 5
      ? "ring-2 ring-emerald-400/30"
      : "";

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, order.id)}
      className={[
        "border bg-black/25 hover:bg-black/35 transition shadow-sm",
        compact ? "rounded-2xl" : "rounded-3xl",
        flash ? "border-red-500/60 ring-2 ring-red-500/30" : "border-white/10",
        ageBand,
      ].join(" ")}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">#{order.id.slice(0, 6)}</div>
              <div className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${headerChip}`}>
                {statusLabel}
              </div>
              {updating && (
                <div className="text-[10px] text-white/60">Updating…</div>
              )}
            </div>

            <div className="mt-1 text-[11px] text-white/60">
              {order.type === "dine_in" ? `Table ${order.table?.name || "?"}` : "Takeaway"}
              <span className="mx-2 text-white/30">•</span>
              Items: {itemCount}
              <span className="mx-2 text-white/30">•</span>
              {ageMin}m ago
              {order.openedByUser && (
                <>
                  <span className="mx-2 text-white/30">•</span>
                  by {order.openedByUser.fullName || order.openedByUser.username}
                </>
              )}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-white/60">Total</div>
            <div className="text-sm font-semibold">£{Number(order.total || 0).toFixed(2)}</div>
          </div>
        </div>

        <div className={compact ? "mt-3 max-h-32 overflow-y-auto space-y-2 pr-1" : "mt-3 max-h-44 overflow-y-auto space-y-2 pr-1"}>
          {(order.items || []).map((it) => (
            <div key={it.id} className="rounded-2xl border border-white/10 bg-white/5 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold truncate">
                  {it.menuItem?.name || "Item"}
                </div>
                <div className="text-xs text-white/70">× {it.quantity}</div>
              </div>
              {it.notes && (
                <div className="mt-1 text-[11px] text-red-200/90">
                  Note: {it.notes}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Quick actions (tablet-friendly) */}
        <div className={compact ? "mt-3 grid grid-cols-3 gap-2" : "mt-4 grid grid-cols-3 gap-2"}>
          <button
            onClick={() => setStatus(order.id, STATUS_NEW)}
            disabled={updating}
            className="rounded-2xl py-2 text-xs font-semibold border border-red-500/30 bg-red-500/10 hover:bg-red-500/15 active:scale-[0.98] transition disabled:opacity-50"
            type="button"
          >
            New
          </button>
          <button
            onClick={() => setStatus(order.id, STATUS_COOKING)}
            disabled={updating}
            className="rounded-2xl py-2 text-xs font-semibold border border-white/15 bg-white/10 hover:bg-white/15 active:scale-[0.98] transition disabled:opacity-50"
            type="button"
          >
            Cooking
          </button>
          <button
            onClick={() => setStatus(order.id, STATUS_READY)}
            disabled={updating}
            className="rounded-2xl py-2 text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 active:scale-[0.98] transition disabled:opacity-50"
            type="button"
          >
            Ready
          </button>
        </div>

        <div className="mt-3 text-[11px] text-white/50">
          Tip: You can also drag the ticket to another column.
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Small UI helpers
// -----------------------------
function TabButton({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-2xl py-2 text-xs font-semibold border transition active:scale-[0.98]",
        active
          ? "bg-red-500/15 border-red-500/40 text-white"
          : "bg-white/5 border-white/10 hover:bg-white/10 text-white/80",
      ].join(" ")}
      type="button"
    >
      {label}
    </button>
  );
}

function playBeep({ enabled, loud }) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = loud ? 0.12 : 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 180);
  } catch {}
}

// -----------------------------
// Toast system
// -----------------------------
function useToasts() {
  const [toasts, setToasts] = useState([]);

  function makeId() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch {}
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function push(type, text) {
    const id = makeId();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }

  return {
    toasts,
    success: (t) => push("success", t),
    error: (t) => push("error", t),
    info: (t) => push("info", t),
    remove: (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
  };
}

function ToastStack({ toasts, remove }) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "min-w-[260px] max-w-[360px] rounded-2xl border px-4 py-3 shadow-lg backdrop-blur cursor-pointer",
            t.type === "success" && "bg-emerald-500/15 border-emerald-500/30 text-emerald-100",
            t.type === "error" && "bg-red-500/15 border-red-500/30 text-red-100",
            t.type === "info" && "bg-white/10 border-white/15 text-white",
          ].join(" ")}
          onClick={() => remove(t.id)}
          role="button"
          tabIndex={0}
        >
          <div className="text-sm font-semibold">{t.text}</div>
          <div className="text-[11px] opacity-70 mt-1">Tap to dismiss</div>
        </div>
      ))}
    </div>
  );
}
