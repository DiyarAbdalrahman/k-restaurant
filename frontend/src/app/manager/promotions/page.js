"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";

const ROLE_ALLOWED = new Set(["admin", "manager"]);

export default function ManagerPromotionsPage() {
  const { settings } = useSettings();
  const logo = settings?.logoUrl || "/logo.png";
  const [user, setUser] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [menu, setMenu] = useState([]);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    name: "",
    type: "percent",
    amount: 10,
    startsAt: "",
    endsAt: "",
    isActive: true,
    categoryIds: [],
    itemIds: [],
  });

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
    loadAll();
  }, [user]);

  async function loadAll() {
    try {
      setMessage("");
      const [promoRes, menuRes] = await Promise.all([
        api.get("/promotions"),
        api.get("/menu/admin"),
      ]);
      setPromotions(promoRes.data || []);
      setMenu(menuRes.data || []);
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to load promotions";
      setMessage(msg);
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  const categories = useMemo(() => menu || [], [menu]);
  const items = useMemo(() => {
    const list = [];
    for (const c of menu || []) {
      for (const it of c.items || []) list.push({ ...it, categoryName: c.name });
    }
    return list;
  }, [menu]);

  async function createPromotion() {
    try {
      await api.post("/promotions", form);
      setForm({
        name: "",
        type: "percent",
        amount: 10,
        startsAt: "",
        endsAt: "",
        isActive: true,
        categoryIds: [],
        itemIds: [],
      });
      await loadAll();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to create promotion";
      setMessage(msg);
    }
  }

  async function deletePromotion(id) {
    const ok = window.confirm("Delete this promotion?");
    if (!ok) return;
    await api.delete(`/promotions/${id}`);
    await loadAll();
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Kurda Restaurant" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-lg font-bold">Promotions</div>
              <div className="text-[11px] text-slate-400">
                {user?.fullName} • {user?.role}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="/manager/reports" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Reports</a>
            <a href="/manager/orders" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Orders</a>
            <a href="/manager/menu" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Menu</a>
            <a href="/manager/tables" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Tables</a>
            <a href="/manager/users" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Users</a>
            <a href="/manager/settings" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">Settings</a>
            <a href="/pos" className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">POS</a>
            <button onClick={logout} className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500">Logout</button>
          </div>
        </div>
        {message && (
          <div className="px-4 md:px-6 pb-3 text-xs text-amber-300">{message}</div>
        )}
      </header>

      <div className="px-4 md:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
            <div className="text-sm font-semibold mb-3">Create Promotion</div>
            <div className="space-y-2">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Promotion name"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
                >
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  placeholder="Amount"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
                />
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/70 mb-2">Categories</div>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((c) => (
                    <label key={c.id} className="text-xs flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.categoryIds.includes(c.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...form.categoryIds, c.id]
                            : form.categoryIds.filter((x) => x !== c.id);
                          setForm({ ...form, categoryIds: next });
                        }}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 max-h-56 overflow-y-auto">
                <div className="text-xs text-white/70 mb-2">Items</div>
                <div className="grid grid-cols-1 gap-2">
                  {items.map((it) => (
                    <label key={it.id} className="text-xs flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.itemIds.includes(it.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...form.itemIds, it.id]
                            : form.itemIds.filter((x) => x !== it.id);
                          setForm({ ...form, itemIds: next });
                        }}
                      />
                      {it.name} <span className="text-white/50">({it.categoryName})</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={createPromotion}
                className="w-full rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500"
              >
                Create Promotion
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
              <div className="col-span-4">Name</div>
              <div className="col-span-3">Type</div>
              <div className="col-span-3">Dates</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {promotions.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-12 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03]"
                >
                  <div className="col-span-4">
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-white/60">
                      {p.isActive ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <div className="col-span-3 text-xs">
                    {p.type} • {p.amount}
                  </div>
                  <div className="col-span-3 text-xs text-white/60">
                    {new Date(p.startsAt).toLocaleDateString()} → {new Date(p.endsAt).toLocaleDateString()}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      onClick={() => deletePromotion(p.id)}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold bg-red-600/20 border border-red-500/30 hover:bg-red-600/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {promotions.length === 0 && (
                <div className="px-4 py-6 text-sm text-slate-400">No promotions yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
