"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { resolveMediaUrl } from "@/lib/media";

const ROLE_ALLOWED = new Set(["admin", "manager"]);

function Section({ title, children }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
      <div className="text-sm font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}

export default function ManagerMenuPage() {
  const { settings } = useSettings();
  const logo = settings?.logoUrl || "/logo.png";
  const [user, setUser] = useState(null);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "Confirm",
    body: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
  });
  const confirmResolverRef = useRef(null);

  const [newCatName, setNewCatName] = useState("");
  const [newCatSort, setNewCatSort] = useState(0);

  const [newItem, setNewItem] = useState({
    categoryId: "",
    name: "",
    basePrice: "",
    description: "",
    sku: "",
    imageUrl: "",
  });
  const [showInactive, setShowInactive] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    loadMenu();
  }, [user, showInactive]);

  async function loadMenu() {
    try {
      setLoading(true);
      setMessage("");
      const res = await api.get(showInactive ? "/menu/admin" : "/menu");
      setMenu(res.data || []);
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.message || "Failed to load menu";
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  const categories = useMemo(() => menu || [], [menu]);
  const filteredCategories = useMemo(() => {
    const cQuery = catSearch.trim().toLowerCase();
    const iQuery = itemSearch.trim().toLowerCase();
    return categories
      .map((cat) => {
        const items = (cat.items || []).filter((it) => {
          if (!showInactive && !it.isActive) return false;
          if (!iQuery) return true;
          const hay = `${it.name || ""} ${it.description || ""}`.toLowerCase();
          return hay.includes(iQuery);
        });
        return { ...cat, items };
      })
      .filter((cat) => {
        if (!cQuery) return true;
        return String(cat.name || "").toLowerCase().includes(cQuery);
      })
      .filter((cat) => (itemSearch.trim() ? cat.items.length > 0 : true));
  }, [categories, catSearch, itemSearch, showInactive]);

  async function createCategory() {
    if (!newCatName.trim()) return;
    try {
      await api.post("/menu/categories", {
        name: newCatName.trim(),
        sortOrder: Number(newCatSort || 0),
      });
      setNewCatName("");
      setNewCatSort(0);
      await loadMenu();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to create category";
      setMessage(msg);
    }
  }

  async function updateCategory(id, patch) {
    try {
      await api.patch(`/menu/categories/${id}`, patch);
      await loadMenu();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to update category";
      setMessage(msg);
    }
  }

  async function deleteCategory(id) {
    const ok = await askConfirm({
      title: "Archive category",
      body: "Archive this category? Items will be hidden in POS.",
      confirmText: "Archive",
    });
    if (!ok) return;
    try {
      await api.delete(`/menu/categories/${id}`);
      await loadMenu();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to delete category";
      setMessage(msg);
    }
  }

  async function createItem() {
    if (!newItem.categoryId || !newItem.name.trim() || !newItem.basePrice) return;
    try {
      await api.post("/menu/items", {
        categoryId: newItem.categoryId,
        name: newItem.name.trim(),
        basePrice: Number(newItem.basePrice),
        description: newItem.description || "",
        sku: newItem.sku || "",
        imageUrl: newItem.imageUrl || "",
      });
      setNewItem({ categoryId: "", name: "", basePrice: "", description: "", sku: "", imageUrl: "" });
      await loadMenu();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to create item";
      setMessage(msg);
    }
  }

  async function updateItem(id, patch) {
    try {
      await api.patch(`/menu/items/${id}`, patch);
      await loadMenu();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to update item";
      setMessage(msg);
    }
  }

  async function deleteItem(id) {
    const ok = await askConfirm({
      title: "Delete item",
      body: "Delete this item?",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.delete(`/menu/items/${id}`);
      await loadMenu();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to delete item";
      setMessage(msg);
    }
  }

  async function uploadItemImage(file, onDone) {
    if (!file) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/menu/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onDone(res.data.url);
    } catch (e) {
      const msg = e?.response?.data?.message || "Upload failed";
      setMessage(msg);
    } finally {
      setUploading(false);
    }
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

  if (!user) return null;
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading menu...
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
        <div className="px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={resolveMediaUrl(logo)} alt="Kurda Restaurant" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-lg font-bold">Menu Management</div>
              <div className="text-[11px] text-slate-400">
                {user.fullName} • {user.role}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs text-white/70 mr-2">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive
            </label>
            <a
              href="/manager/reports"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Reports
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
        <div className="lg:col-span-4 space-y-4">
          <Section title="Create Category">
            <div className="space-y-2">
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                type="number"
                value={newCatSort}
                onChange={(e) => setNewCatSort(e.target.value)}
                placeholder="Sort order"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={createCategory}
                className="w-full rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500"
              >
                Add Category
              </button>
            </div>
          </Section>

          <Section title="Create Item">
            <div className="space-y-2">
              <select
                value={newItem.categoryId}
                onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="Item name"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                type="number"
                value={newItem.basePrice}
                onChange={(e) => setNewItem({ ...newItem, basePrice: e.target.value })}
                placeholder="Price"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Description (optional)"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                value={newItem.sku}
                onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                placeholder="SKU (optional)"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              {settings?.menuShowItemImages && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-white/70 mb-2">Item image</div>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl bg-white/10 border border-white/10 overflow-hidden">
                      {newItem.imageUrl ? (
                        <img
                          src={resolveMediaUrl(newItem.imageUrl)}
                          alt="Item"
                          className="w-full h-full object-contain bg-black/30"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40">
                          No image
                        </div>
                      )}
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 cursor-pointer">
                      <span className="text-base leading-none">📷</span>
                      <span>{uploading ? "Uploading..." : "Add image"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) =>
                          uploadItemImage(e.target.files?.[0], (url) =>
                            setNewItem({ ...newItem, imageUrl: url })
                          )
                        }
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>
              )}
              <button
                onClick={createItem}
                className="w-full rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500"
              >
                Add Item
              </button>
            </div>
          </Section>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <Section title="Search & Filters">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                placeholder="Search categories..."
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search items..."
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
            </div>
          </Section>

          {filteredCategories.map((cat) => (
            <Section key={cat.id} title={cat.name}>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  defaultValue={cat.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== cat.name) updateCategory(cat.id, { name: v });
                  }}
                  className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
                />
                <input
                  type="number"
                  defaultValue={cat.sortOrder || 0}
                  onBlur={(e) => updateCategory(cat.id, { sortOrder: Number(e.target.value || 0) })}
                  className="w-28 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
                />
                <label className="text-xs text-white/70 flex items-center gap-1">
                  <input
                    type="checkbox"
                    defaultChecked={cat.isActive}
                    onChange={(e) => updateCategory(cat.id, { isActive: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  onClick={() => deleteCategory(cat.id)}
                  className="rounded-xl px-3 py-2 text-xs font-semibold bg-red-600/20 border border-red-500/30 hover:bg-red-600/30"
                >
                  Archive
                </button>
              </div>

              <div className="space-y-2">
                {(cat.items || []).map((it) => (
                  <div
                    key={it.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-center"
                  >
                    {settings?.menuShowItemImages && (
                      <div className="md:col-span-2">
                        <div className="w-full aspect-[4/3] rounded-xl bg-white/10 border border-white/10 overflow-hidden">
                          {it.imageUrl ? (
                            <img
                              src={resolveMediaUrl(it.imageUrl)}
                              alt={it.name}
                              className="w-full h-full object-contain bg-black/30"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[11px] text-white/40">
                              No image
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className={settings?.menuShowItemImages ? "md:col-span-4" : "md:col-span-5"}>
                      <div className="text-[11px] text-white/50 mb-1">Item name</div>
                      <input
                        defaultValue={it.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== it.name) updateItem(it.id, { name: v });
                        }}
                        className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs outline-none"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-[11px] text-white/50 mb-1">Price</div>
                      <input
                        type="number"
                        defaultValue={it.basePrice}
                        onBlur={(e) => updateItem(it.id, { basePrice: Number(e.target.value) })}
                        className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs outline-none"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <div className="text-[11px] text-white/50 mb-1">Description</div>
                      <input
                        defaultValue={it.description || ""}
                        onBlur={(e) => updateItem(it.id, { description: e.target.value })}
                        className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs outline-none"
                      />
                    </div>
                    <div className="md:col-span-3 flex flex-wrap items-center gap-2 justify-start md:justify-end">
                      <label className="text-xs text-white/70 flex items-center gap-1">
                        <input
                          type="checkbox"
                          defaultChecked={it.isActive}
                          onChange={(e) => updateItem(it.id, { isActive: e.target.checked })}
                        />
                        Active
                      </label>
                      {settings?.menuShowItemImages && (
                        <label className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/70 hover:bg-white/10 cursor-pointer">
                          <span className="text-xs leading-none">📷</span>
                          <span>{uploading ? "Uploading" : "Image"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) =>
                              uploadItemImage(e.target.files?.[0], (url) =>
                                updateItem(it.id, { imageUrl: url })
                              )
                            }
                            disabled={uploading}
                            className="hidden"
                          />
                        </label>
                      )}
                      <button
                        onClick={() => deleteItem(it.id)}
                        className="rounded-lg px-2 py-1.5 text-xs font-semibold bg-red-600/20 border border-red-500/30 hover:bg-red-600/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ))}
        </div>
      </div>
    </div>
  );
}
