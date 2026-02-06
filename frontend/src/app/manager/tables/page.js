"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { resolveMediaUrl } from "@/lib/media";

const ROLE_ALLOWED = new Set(["admin", "manager"]);

export default function ManagerTablesPage() {
  const { settings } = useSettings();
  const logo = settings?.logoUrl || "/logo.png";
  const [user, setUser] = useState(null);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "Confirm",
    body: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
  });
  const confirmResolverRef = useRef(null);

  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [bulkPrefix, setBulkPrefix] = useState("T");
  const [bulkStart, setBulkStart] = useState(1);
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkArea, setBulkArea] = useState("");
  const [dragId, setDragId] = useState(null);

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
    loadTables();
  }, [user]);

  async function loadTables() {
    try {
      setLoading(true);
      setMessage("");
      const [tablesRes, ordersRes] = await Promise.all([
        api.get("/tables"),
        api.get("/orders"),
      ]);
      setTables(tablesRes.data || []);
      setOrders(ordersRes.data || []);
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to load tables";
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  async function addTable() {
    if (!name.trim()) return;
    try {
      await api.post("/tables", { name: name.trim(), area: area.trim() || undefined });
      setName("");
      setArea("");
      await loadTables();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to add table";
      setMessage(msg);
    }
  }

  async function bulkAdd() {
    const count = Math.max(1, Number(bulkCount || 0));
    const start = Math.max(1, Number(bulkStart || 1));
    const prefix = String(bulkPrefix || "").trim();
    if (!prefix) {
      setMessage("Prefix is required for bulk add");
      return;
    }
    try {
      for (let i = 0; i < count; i++) {
        const name = `${prefix}${start + i}`;
        await api.post("/tables", { name, area: bulkArea.trim() || undefined });
      }
      await loadTables();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to bulk add tables";
      setMessage(msg);
    }
  }

  async function normalizeNumericOrder() {
    try {
      const sorted = [...tables].sort((a, b) => {
        const an = Number(String(a.name || "").replace(/\D/g, "")) || 0;
        const bn = Number(String(b.name || "").replace(/\D/g, "")) || 0;
        if (an !== bn) return an - bn;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        await api.patch(`/tables/${t.id}`, { sortOrder: i + 1 });
      }
      await loadTables();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to normalize order";
      setMessage(msg);
    }
  }

  async function updateTable(id, patch) {
    try {
      const res = await api.patch(`/tables/${id}`, patch);
      setTables((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...res.data } : t))
      );
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to update table";
      setMessage(msg);
    }
  }

  async function deleteTable(id) {
    const ok = await askConfirm({
      title: "Delete table",
      body: "Delete this table?",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.delete(`/tables/${id}`);
      await loadTables();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to delete table";
      setMessage(msg);
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  function askConfirm({ title, body, confirmText = "Confirm", cancelText = "Cancel" }) {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({ open: true, title, body, confirmText, cancelText });
    });
  }

  function closeConfirm(result) {
    setConfirmState((prev) => ({ ...prev, open: false }));
    if (confirmResolverRef.current) {
      confirmResolverRef.current(result);
      confirmResolverRef.current = null;
    }
  }

  const areas = useMemo(() => {
    const set = new Set();
    (tables || []).forEach((t) => {
      if (t.area) set.add(t.area);
    });
    return Array.from(set).sort();
  }, [tables]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (tables || []).filter((t) => {
      if (areaFilter !== "all" && String(t.area || "") !== areaFilter) return false;
      if (!q) return true;
      return String(t.name || "").toLowerCase().includes(q);
    });
    return list.sort((a, b) => {
      const sa = Number(a.sortOrder || 0);
      const sb = Number(b.sortOrder || 0);
      if (sa !== sb) return sa - sb;
      const an = Number(String(a.name || "").replace(/\D/g, "")) || 0;
      const bn = Number(String(b.name || "").replace(/\D/g, "")) || 0;
      if (an !== bn) return an - bn;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [tables, query, areaFilter]);

  const tableStatusMap = useMemo(() => {
    const map = new Map();
    (orders || []).forEach((o) => {
      const tableId = o.table?.id || o.tableId;
      if (!tableId) return;
      // priority: ready > in_progress > sent_to_kitchen > open
      const rank = (s) =>
        s === "ready" ? 4 : s === "in_progress" ? 3 : s === "sent_to_kitchen" ? 2 : 1;
      const prev = map.get(tableId);
      if (!prev || rank(o.status) > rank(prev.status)) {
        map.set(tableId, { status: o.status, count: (prev?.count || 0) + 1 });
      } else {
        map.set(tableId, { ...prev, count: (prev?.count || 0) + 1 });
      }
    });
    return map;
  }, [orders]);

  async function persistSortOrder(nextList) {
    try {
      for (let i = 0; i < nextList.length; i++) {
        const t = nextList[i];
        if (t.sortOrder !== i + 1) {
          await api.patch(`/tables/${t.id}`, { sortOrder: i + 1 });
        }
      }
      setTables(nextList.map((t, i) => ({ ...t, sortOrder: i + 1 })));
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to reorder tables";
      setMessage(msg);
    }
  }

  function onDragStart(id) {
    setDragId(id);
  }

  function onDrop(targetId) {
    if (!dragId || dragId === targetId) return;
    const current = [...filtered];
    const dragIndex = current.findIndex((t) => t.id === dragId);
    const targetIndex = current.findIndex((t) => t.id === targetId);
    if (dragIndex === -1 || targetIndex === -1) return;
    const [moved] = current.splice(dragIndex, 1);
    current.splice(targetIndex, 0, moved);
    // Merge reordered subset back into full tables list
    const idToIndex = new Map(current.map((t, i) => [t.id, i]));
    const merged = [...tables].sort((a, b) => {
      const ai = idToIndex.has(a.id) ? idToIndex.get(a.id) : Infinity;
      const bi = idToIndex.has(b.id) ? idToIndex.get(b.id) : Infinity;
      if (ai !== bi) return ai - bi;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
    persistSortOrder(merged);
    setDragId(null);
  }

  if (!user) return null;
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading tables...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {confirmState.open && (
        <div className="fixed inset-0 z-[9997] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-black/90 p-4">
            <div className="text-lg font-semibold">{confirmState.title}</div>
            <div className="text-xs text-white/60 mt-1">{confirmState.body}</div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => closeConfirm(false)}
                className="flex-1 rounded-xl py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10"
              >
                {confirmState.cancelText}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className="flex-1 rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500"
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={resolveMediaUrl(logo) || "/logo.png"} alt="Kurda Restaurant" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-lg font-bold">Table Management</div>
              <div className="text-[11px] text-slate-400">
                {user.fullName} • {user.role}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href="/manager/reports"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Reports
            </a>
            <a
              href="/manager/menu"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Menu
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
              onClick={logout}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500"
            >
              Logout
            </button>
          </div>
        </div>
        {message && (
          <div className="px-4 md:px-6 pb-3 text-xs text-amber-300">
            {message}
          </div>
        )}
      </header>

      <div className="px-4 md:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
            <div className="text-sm font-semibold mb-3">Add Table</div>
            <div className="space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Table name (e.g., T21)"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Area (optional)"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={addTable}
                className="w-full rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500"
              >
                Add Table
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
            <div className="text-sm font-semibold mb-3">Search & Filter</div>
            <div className="space-y-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search table name..."
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              >
                <option value="all">All areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={normalizeNumericOrder}
              className="mt-3 w-full rounded-xl py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10"
            >
              Normalize order 1→N
            </button>
          </div>

          <div className="mt-4 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
            <div className="text-sm font-semibold mb-3">Bulk Add</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={bulkPrefix}
                onChange={(e) => setBulkPrefix(e.target.value)}
                placeholder="Prefix (e.g., T)"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                type="number"
                value={bulkStart}
                onChange={(e) => setBulkStart(Number(e.target.value))}
                placeholder="Start #"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                type="number"
                value={bulkCount}
                onChange={(e) => setBulkCount(Number(e.target.value))}
                placeholder="Count"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                value={bulkArea}
                onChange={(e) => setBulkArea(e.target.value)}
                placeholder="Area (optional)"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
            </div>
            <button
              onClick={bulkAdd}
              className="mt-3 w-full rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500"
            >
              Add Multiple Tables
            </button>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
              <div className="col-span-4">Name</div>
              <div className="col-span-3">Area</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => onDragStart(t.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(t.id)}
                  className="grid grid-cols-12 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] cursor-move"
                >
                  <div className="col-span-4">
                    <input
                      defaultValue={t.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== t.name) updateTable(t.id, { name: v });
                      }}
                      className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs outline-none"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      defaultValue={t.area || ""}
                      onBlur={(e) => updateTable(t.id, { area: e.target.value })}
                      className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs outline-none"
                    />
                  </div>
                  <div className="col-span-3">
                    {(() => {
                      const s = tableStatusMap.get(t.id);
                      if (!s) return <span className="text-xs text-white/40">Empty</span>;
                      const tone =
                        s.status === "ready"
                          ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/30"
                          : s.status === "in_progress"
                          ? "bg-white/10 text-white border-white/20"
                          : "bg-amber-500/20 text-amber-200 border-amber-500/30";
                      const label =
                        s.status === "ready"
                          ? "Ready"
                          : s.status === "in_progress"
                          ? "Cooking"
                          : "Occupied";
                      return (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border ${tone}`}>
                          {label} • {s.count}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="col-span-2 flex items-center justify-end">
                    <button
                      onClick={() => deleteTable(t.id)}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold bg-red-600/20 border border-red-500/30 hover:bg-red-600/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-sm text-slate-400">No tables yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
