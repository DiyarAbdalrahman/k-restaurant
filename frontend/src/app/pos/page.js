"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { kitchenSocket } from "@/lib/socket";

export default function PosPage() {
  // -----------------------------
  // Core state
  // -----------------------------
  const [user, setUser] = useState(null);
  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);

  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  // Busy flags (prevents double-tap on tablet)
  const [placingOrder, setPlacingOrder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  // Payment
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // Discounts (used ONLY when building a new order from cart)
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [serviceChargePercent, setServiceChargePercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);

  // Modern menu controls
  const [search, setSearch] = useState("");
  const [activeCatId, setActiveCatId] = useState(null);

  // Favorites + Recent (POS speed)
  const [favorites, setFavorites] = useState([]);
  const [recent, setRecent] = useState([]);

  // Toasts
  const toast = useToasts();

  // Refs
  const searchRef = useRef(null);

  // -----------------------------
  // Helpers: payments + totals
  // -----------------------------
  function calcOrderPaid(order) {
    const paymentsArr =
      order?.payments || order?.Payments || order?.payment || order?.Payment || [];
    if (!Array.isArray(paymentsArr)) return 0;
    return paymentsArr.reduce((s, p) => s + Number(p.amount || 0), 0);
  }

  const cartTotals = useMemo(() => {
    const safeDiscount = Number(discountValue) || 0;
    const safeService = Number(serviceChargePercent) || 0;
    const safeTax = Number(taxPercent) || 0;

    const subtotal = cart.reduce((sum, item) => sum + item.qty * item.basePrice, 0);

    let discountAmount = 0;
    if (discountType === "percent") discountAmount = (subtotal * safeDiscount) / 100;
    else if (discountType === "fixed") discountAmount = safeDiscount;

    const serviceCharge = (subtotal - discountAmount) * (safeService / 100);
    const taxAmount = (subtotal - discountAmount + serviceCharge) * (safeTax / 100);
    const total = subtotal - discountAmount + serviceCharge + taxAmount;

    return { subtotal, discountAmount, serviceCharge, taxAmount, total };
  }, [cart, discountType, discountValue, serviceChargePercent, taxPercent]);

  // Checkout totals:
  // - If selectedOrder exists: show server totals and payments (REAL POS flow)
  // - Else: show cart totals (building a new order)
  const checkoutTotals = useMemo(() => {
    if (selectedOrder) {
      const subtotal = Number(selectedOrder.subtotal || 0);
      const discountAmount = Number(selectedOrder.discountAmount || 0);
      const serviceCharge = Number(selectedOrder.serviceCharge || 0);
      const taxAmount = Number(selectedOrder.taxAmount || 0);
      const total = Number(selectedOrder.total || 0);

      const paid = calcOrderPaid(selectedOrder);
      const remaining = Math.max(0, total - paid);

      return { subtotal, discountAmount, serviceCharge, taxAmount, total, paid, remaining };
    }

    const total = Number(cartTotals.total || 0);
    return {
      subtotal: Number(cartTotals.subtotal || 0),
      discountAmount: Number(cartTotals.discountAmount || 0),
      serviceCharge: Number(cartTotals.serviceCharge || 0),
      taxAmount: Number(cartTotals.taxAmount || 0),
      total,
      paid: 0,
      remaining: total,
    };
  }, [selectedOrder, cartTotals]);

  // -----------------------------
  // Load favorites from storage (client only)
  // -----------------------------
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pos:favs") || "[]");
      if (Array.isArray(saved)) setFavorites(saved);
    } catch {
      setFavorites([]);
    }
  }, []);

  function toggleFav(id) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 60);
      try {
        localStorage.setItem("pos:favs", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function pushRecent(item) {
    setRecent((prev) => {
      const next = [item, ...prev.filter((x) => x.id !== item.id)].slice(0, 8);
      return next;
    });
  }

  // -----------------------------
  // Menu filtering
  // -----------------------------
  const normalizedSearch = search.trim().toLowerCase();

  const activeCategory = useMemo(() => {
    if (!menu?.length) return null;
    return menu.find((c) => c.id === activeCatId) || menu[0];
  }, [menu, activeCatId]);

  const visibleItems = useMemo(() => {
    const items = activeCategory?.items ?? [];
    if (!normalizedSearch) return items;
    return items.filter((it) => String(it.name || "").toLowerCase().includes(normalizedSearch));
  }, [activeCategory, normalizedSearch]);

  const allItemsById = useMemo(() => {
    const map = new Map();
    for (const cat of menu || []) {
      for (const it of cat.items || []) map.set(it.id, it);
    }
    return map;
  }, [menu]);

  const favoriteItems = useMemo(() => {
    return favorites.map((id) => allItemsById.get(id)).filter(Boolean);
  }, [favorites, allItemsById]);

  // -----------------------------
  // Keyboard shortcuts (PC)
  // / focuses search, Esc clears, Enter adds top result (when search focused)
  // Ctrl/Cmd+Enter creates order
  // -----------------------------
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearch("");
      }
      if (e.key === "Enter" && document.activeElement === searchRef.current) {
        if (visibleItems[0]) addToCart(visibleItems[0]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (!placingOrder && cart.length > 0) createOrder();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visibleItems, placingOrder, cart.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------
  // API: load orders
  // -----------------------------
  async function loadOrders() {
    try {
      const ordersRes = await api.get("/orders");
      const data = ordersRes.data || [];
      setOpenOrders(data);

      setSelectedOrder((prev) => {
        if (!prev) return prev;
        return data.find((o) => o.id === prev.id) || prev;
      });
    } catch (err) {
      console.error(err);
    }
  }

  // -----------------------------
  // Socket updates (kitchen -> POS)
  // -----------------------------
  useEffect(() => {
    const onUpdated = (updatedOrder) => {
      if (!updatedOrder?.id) return;

      let found = false;

      setOpenOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === updatedOrder.id);
        if (idx === -1) return prev;
        found = true;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...updatedOrder };
        return copy;
      });

      setSelectedOrder((prev) => {
        if (!prev) return prev;
        if (prev.id !== updatedOrder.id) return prev;
        return { ...prev, ...updatedOrder };
      });

      if (!found) loadOrders();
    };

    kitchenSocket.on("order:updated", onUpdated);
    return () => kitchenSocket.off("order:updated", onUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // Initial load
  // -----------------------------
  useEffect(() => {
    const u = getUser();
    if (!u) {
      window.location.href = "/login";
      return;
    }
    setUser(u);
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInitialData() {
    try {
      setLoading(true);
      const [tablesRes, menuRes] = await Promise.all([api.get("/tables"), api.get("/menu")]);
      const tablesData = tablesRes.data || [];
      const menuData = menuRes.data || [];

      setTables(tablesData);
      setMenu(menuData);

      if (menuData.length > 0) setActiveCatId(menuData[0].id);

      await loadOrders();
    } catch (err) {
      console.error(err);
      toast.error("Failed to load data from server");
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // Cart
  // -----------------------------
  function addToCart(item) {
    pushRecent(item);

    // If user is currently checking out an existing order,
    // keep it, but adding items should typically mean "new order".
    // So we clear selectedOrder so right panel shows cart again.
    if (selectedOrder) setSelectedOrder(null);

    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id && !c.note);
      if (existing) {
        return prev.map((c) => (c.id === item.id && !c.note ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { ...item, qty: 1, note: "" }];
    });
  }

  function changeCartQty(index, delta) {
    setCart((prev) => {
      const updated = [...prev];
      updated[index].qty += delta;
      if (updated[index].qty <= 0) updated.splice(index, 1);
      return updated;
    });
  }

  function clearCart() {
    if (cart.length === 0) return;
    const ok = window.confirm("Clear the cart?");
    if (!ok) return;
    setCart([]);
    toast.info("Cart cleared");
  }

  // -----------------------------
  // Create order
  // -----------------------------
  async function createOrder() {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    try {
      setPlacingOrder(true);

      const body = {
        type: selectedTableId ? "dine_in" : "takeaway",
        tableId: selectedTableId,
        notes: "",
        subtotal: Number(cartTotals.subtotal.toFixed(2)),
        discountAmount: Number(cartTotals.discountAmount.toFixed(2)),
        taxAmount: Number(cartTotals.taxAmount.toFixed(2)),
        serviceCharge: Number(cartTotals.serviceCharge.toFixed(2)),
        total: Number(cartTotals.total.toFixed(2)),
        items: cart.map((c) => ({
          menuItemId: c.id,
          quantity: c.qty,
          notes: c.note || "",
        })),
      };

      const res = await api.post("/orders", body);

      await loadOrders();

      // Clear cart (new order is now created)
      setCart([]);

      // IMPORTANT: switch right panel to Checkout for this order
      setSelectedOrder(res.data);

      // Nice UX: keep selected table matching the order
      setSelectedTableId(res.data?.tableId || selectedTableId);

      toast.success("Order created");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create order");
    } finally {
      setPlacingOrder(false);
    }
  }

  // -----------------------------
  // Send to kitchen
  // -----------------------------
  async function sendToKitchen() {
    if (!selectedOrder) return;

    try {
      setIsSending(true);
      await api.post(`/orders/${selectedOrder.id}/send-to-kitchen`);
      toast.info("Sent to kitchen");
      await loadOrders();
    } catch (err) {
      console.error(err);
      toast.error("Failed to send to kitchen");
    } finally {
      setIsSending(false);
    }
  }

  // -----------------------------
  // Payments
  // -----------------------------
  async function addPayment() {
    if (!selectedOrder) return;

    const amt = Number(paymentAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    // Optional: prevent paying more than remaining
    if (amt > checkoutTotals.remaining + 0.0001) {
      toast.error("Amount is more than remaining");
      return;
    }

    try {
      setIsPaying(true);

      // Optimistic feel: clear input immediately
      setPaymentAmount("");

      await api.post(`/payments/orders/${selectedOrder.id}`, {
        amount: amt,
        method: paymentMethod,
      });

      toast.success("Payment recorded");
      await loadOrders();
    } catch (err) {
      console.error(err);
      toast.error("Failed to record payment");
      setPaymentAmount(String(amt.toFixed(2)));
    } finally {
      setIsPaying(false);
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  // -----------------------------
  // UI
  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        Loading POS...
      </div>
    );
  }

  const selectedTableName = selectedTableId
    ? tables.find((t) => t.id === selectedTableId)?.name || "?"
    : null;

  return (
    <div className="min-h-screen bg-black text-white">
      <ToastStack toasts={toast.toasts} remove={toast.remove} />

      {/* Top header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-600/30 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">Restaurant POS</div>
              <div className="text-xs text-white/60">
                {selectedTableName ? `Table: ${selectedTableName}` : "Takeaway"} • Orders:{" "}
                {openOrders.length} • Press “/” to search
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <div className="font-medium">{user?.fullName}</div>
              <div className="text-xs text-white/60">{user?.role}</div>
            </div>

            <button
              onClick={logout}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.98] transition text-xs font-semibold"
              type="button"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="h-[calc(100vh-81px)] grid grid-cols-12 gap-4 p-4">
        {/* LEFT: tables + orders */}
        <aside className="col-span-3 rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-sm font-semibold">Tables</div>
            <div className="text-xs text-white/60">Tap to select / deselect</div>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2">
              {tables.map((t) => {
                const active = selectedTableId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTableId(active ? null : t.id);
                      // if you're in checkout, stay there; table selection is for creating new orders
                    }}
                    className={[
                      "rounded-xl border px-3 py-2 text-xs font-medium transition active:scale-[0.98]",
                      active
                        ? "border-red-500/60 bg-red-500/15 text-white"
                        : "border-white/10 bg-white/5 hover:bg-white/10 text-white/90",
                    ].join(" ")}
                    type="button"
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">Open Orders</div>
                <button
                  onClick={loadOrders}
                  className="text-xs text-white/60 hover:text-white"
                  type="button"
                >
                  Refresh
                </button>
              </div>

              <div className="space-y-2">
                {openOrders.map((order) => {
                  const isSelected = selectedOrder?.id === order.id;
                  return (
                    <button
                      key={order.id}
                      onClick={() => {
                        // Selecting an order = enter Checkout mode
                        setSelectedOrder(order);

                        // sync table label for header UX
                        setSelectedTableId(order?.table?.id || order?.tableId || null);

                        // (optional) clear cart so you don't confuse cashier
                        // setCart([]);
                      }}
                      className={[
                        "w-full text-left rounded-2xl border p-3 transition active:scale-[0.99]",
                        isSelected
                          ? "border-red-500/50 bg-red-500/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10",
                      ].join(" ")}
                      type="button"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">#{String(order.id).slice(0, 6)}</span>
                        <span className="text-[11px] text-white/60">{order.type}</span>
                      </div>

                      <div className="mt-1 text-white/90 text-sm">
                        £{Number(order.total || 0).toFixed(2)}
                      </div>

                      {order.table && (
                        <div className="text-[11px] text-white/60">Table: {order.table.name}</div>
                      )}

                      <div className="text-[11px] text-white/50 mt-1">Status: {order.status}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* MIDDLE: categories + items */}
        <main className="col-span-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex">
          {/* Categories list (NO horizontal scroll) */}
          <div className="w-56 border-r border-white/10 bg-black/20">
            <div className="px-4 py-3 border-b border-white/10">
              <div className="text-sm font-semibold">Categories</div>
              <div className="text-xs text-white/60">Select to filter items</div>
            </div>

            <div className="p-2 overflow-y-auto h-full">
              {(menu || []).map((cat) => {
                const active = cat.id === activeCatId;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCatId(cat.id);
                      setSearch("");
                    }}
                    className={[
                      "w-full text-left rounded-xl px-3 py-2 text-sm transition border active:scale-[0.99]",
                      active
                        ? "bg-red-500/15 border-red-500/40"
                        : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10",
                    ].join(" ")}
                    type="button"
                  >
                    <div className="font-medium">{cat.name}</div>
                    <div className="text-[11px] text-white/60">{(cat.items || []).length} items</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-white/10 bg-black/10">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold">{activeCategory?.name || "Menu"}</div>
                  <div className="text-xs text-white/60">Tap an item to add to cart</div>
                </div>

                <div className="w-80">
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search items..."
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-red-500/60"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              {/* Favorites + Recent (no horizontal scroll) */}
              {(favoriteItems.length > 0 || recent.length > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">Favorites</div>
                      <div className="text-[11px] text-white/50">Tap ⭐ to pin</div>
                    </div>

                    {favoriteItems.length === 0 ? (
                      <div className="text-xs text-white/60">No favorites yet.</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {favoriteItems.slice(0, 6).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => addToCart(item)}
                            className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition p-2 text-left"
                            type="button"
                          >
                            <div className="text-xs font-semibold leading-4 line-clamp-2">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-white/60 mt-1">
                              £{Number(item.basePrice || 0).toFixed(2)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">Recent</div>
                      <div className="text-[11px] text-white/50">Last tapped</div>
                    </div>

                    {recent.length === 0 ? (
                      <div className="text-xs text-white/60">No recent items.</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {recent.slice(0, 6).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => addToCart(item)}
                            className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition p-2 text-left"
                            type="button"
                          >
                            <div className="text-xs font-semibold leading-4 line-clamp-2">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-white/60 mt-1">
                              £{Number(item.basePrice || 0).toFixed(2)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Category items */}
              {visibleItems.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/60">
                  No items found.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {visibleItems.map((item) => {
                    const isFav = favorites.includes(item.id);

                    return (
                      <div
                        key={item.id}
                        className="group rounded-2xl border border-white/10 bg-black/20 hover:border-red-500/30 hover:bg-red-500/10 transition p-4"
                      >
                        <button
                          onClick={() => addToCart(item)}
                          className="w-full text-left active:scale-[0.99] transition"
                          type="button"
                        >
                          <div className="font-semibold text-sm leading-5">{item.name}</div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="text-white/70 text-xs">Price</div>
                            <div className="text-sm font-semibold text-white">
                              £{Number(item.basePrice || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="mt-3 text-[11px] text-white/50 group-hover:text-white/70">
                            Tap to add
                          </div>
                        </button>

                        <button
                          onClick={() => toggleFav(item.id)}
                          className={[
                            "mt-3 w-full rounded-xl border px-2 py-2 text-xs font-semibold transition active:scale-[0.98]",
                            isFav
                              ? "border-red-500/50 bg-red-500/15 text-white"
                              : "border-white/10 bg-white/5 hover:bg-white/10 text-white/80",
                          ].join(" ")}
                          type="button"
                        >
                          {isFav ? "★ Favorited" : "☆ Favorite"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* RIGHT: cart + checkout */}
        <aside className="col-span-3 rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col">
          {/* CART HEADER */}
          <div className="p-4 border-b border-white/10 bg-black/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">
                  {selectedOrder ? "Checkout" : "Cart"}
                </div>
                <div className="text-xs text-white/60">
                  {selectedOrder ? (
                    <>
                      Order #{String(selectedOrder.id).slice(0, 6)} •{" "}
                      {selectedOrder?.table?.name
                        ? `Table: ${selectedOrder.table.name}`
                        : selectedOrder.type}
                    </>
                  ) : (
                    <>{selectedTableName ? `Table: ${selectedTableName}` : "Takeaway"}</>
                  )}
                </div>
              </div>

              {!selectedOrder ? (
                <button
                  onClick={clearCart}
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition px-3 py-2 text-xs font-semibold"
                  type="button"
                >
                  Clear
                </button>
              ) : (
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition px-3 py-2 text-xs font-semibold"
                  type="button"
                >
                  Back
                </button>
              )}
            </div>
          </div>

          {/* BODY */}
          <div className="p-4 overflow-y-auto flex-1">
            {/* If checking out an existing order */}
            {selectedOrder ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
                  <Row label="Subtotal" value={`£${checkoutTotals.subtotal.toFixed(2)}`} />

                  <div className="pt-2 border-t border-white/10 space-y-1 text-xs text-white/70">
                    <Row
                      label="Discount"
                      value={`-£${checkoutTotals.discountAmount.toFixed(2)}`}
                    />
                    <Row
                      label="Service"
                      value={`£${checkoutTotals.serviceCharge.toFixed(2)}`}
                    />
                    <Row label="Tax" value={`£${checkoutTotals.taxAmount.toFixed(2)}`} />
                  </div>

                  <div className="pt-2 border-t border-white/10">
                    <Row label="Total" value={`£${checkoutTotals.total.toFixed(2)}`} />
                    <Row label="Paid" value={`£${checkoutTotals.paid.toFixed(2)}`} />
                    <Row
                      label="Remaining"
                      value={`£${checkoutTotals.remaining.toFixed(2)}`}
                    />
                  </div>
                </div>

                {/* Send to kitchen */}
                {selectedOrder.status === "open" && (
                  <button
                    onClick={sendToKitchen}
                    disabled={isSending}
                    className="w-full rounded-2xl py-3 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-50 active:scale-[0.98] transition"
                    type="button"
                  >
                    {isSending ? "Sending..." : "Send to Kitchen"}
                  </button>
                )}

                {/* Payment */}
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Take Payment</div>
                    <div className="text-xs text-white/60">
                      Due:{" "}
                      <span className="text-white font-semibold">
                        £{checkoutTotals.remaining.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <MethodButton
                      active={paymentMethod === "cash"}
                      onClick={() => setPaymentMethod("cash")}
                      label="Cash"
                    />
                    <MethodButton
                      active={paymentMethod === "card"}
                      onClick={() => setPaymentMethod("card")}
                      label="Card"
                    />
                    <MethodButton
                      active={paymentMethod === "split"}
                      onClick={() => setPaymentMethod("split")}
                      label="Split"
                    />
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="flex-1 rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm outline-none focus:border-red-500/60"
                      placeholder="0.00"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentAmount(String(checkoutTotals.remaining.toFixed(2)))
                      }
                      className="rounded-2xl px-4 py-3 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10 active:scale-[0.98] transition"
                    >
                      Exact
                    </button>
                  </div>

                  <button
                    onClick={addPayment}
                    disabled={
                      isPaying ||
                      !paymentAmount ||
                      checkoutTotals.remaining <= 0
                    }
                    className="w-full rounded-2xl py-3 text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/40 active:scale-[0.98] transition"
                    type="button"
                  >
                    {isPaying ? "Adding..." : "Add Payment"}
                  </button>
                </div>
              </div>
            ) : (
              // Otherwise: show cart items (building new order)
              <>
                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/60">
                    Cart is empty. Tap items from the menu.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-2xl border border-white/10 bg-black/20 p-3"
                      >
                        <div className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{item.name}</div>
                            <div className="text-xs text-white/60">
                              £{Number(item.basePrice || 0).toFixed(2)} × {item.qty} ={" "}
                              <span className="text-white">
                                £{Number(item.qty * (item.basePrice || 0)).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              const ok = window.confirm("Remove this item?");
                              if (!ok) return;
                              setCart((prev) => prev.filter((_, i) => i !== index));
                            }}
                            className="text-xs px-3 py-2 rounded-xl bg-red-600/20 border border-red-600/30 hover:bg-red-600/30 active:scale-[0.98] transition"
                            type="button"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => changeCartQty(index, -1)}
                            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.98] transition"
                            type="button"
                          >
                            -
                          </button>
                          <div className="w-10 text-center text-sm font-semibold">
                            {item.qty}
                          </div>
                          <button
                            onClick={() => changeCartQty(index, 1)}
                            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.98] transition"
                            type="button"
                          >
                            +
                          </button>
                        </div>

                        <input
                          type="text"
                          value={item.note}
                          onChange={(e) =>
                            setCart((prev) =>
                              prev.map((c, i) =>
                                i === index ? { ...c, note: e.target.value } : c
                              )
                            )
                          }
                          placeholder="Notes (e.g., no onion)"
                          className="mt-3 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs outline-none focus:border-red-500/60"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* FOOTER */}
          <div className="p-4 border-t border-white/10 bg-black/10 space-y-3">
            {/* When building a new order */}
            {!selectedOrder ? (
              <>
                <button
                  disabled={placingOrder || cart.length === 0}
                  onClick={createOrder}
                  className="w-full rounded-2xl py-3 text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/40 active:scale-[0.98] transition"
                  type="button"
                >
                  {placingOrder ? "Creating..." : "Create Order"}
                </button>

                {/* Adjustments (cart-only) */}
                <section className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Totals</div>
                    <div className="text-xs text-white/60">
                      Total:{" "}
                      <span className="text-white font-semibold">
                        £{checkoutTotals.total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <Row label="Subtotal" value={`£${checkoutTotals.subtotal.toFixed(2)}`} />

                  <div className="grid grid-cols-12 gap-2 items-center text-xs">
                    <div className="col-span-6">
                      <label className="block text-[11px] text-white/60 mb-1">Discount</label>
                      <div className="flex gap-2">
                        <select
                          value={discountType}
                          onChange={(e) => setDiscountType(e.target.value)}
                          className="w-28 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs outline-none"
                        >
                          <option value="none">None</option>
                          <option value="percent">%</option>
                          <option value="fixed">£</option>
                        </select>

                        <input
                          type="number"
                          disabled={discountType === "none"}
                          value={discountType === "none" ? "" : discountValue}
                          onChange={(e) => setDiscountValue(Number(e.target.value))}
                          className="flex-1 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs outline-none disabled:opacity-40 focus:border-red-500/60"
                          placeholder={discountType === "percent" ? "0" : "0.00"}
                        />
                      </div>
                    </div>

                    <div className="col-span-3">
                      <label className="block text-[11px] text-white/60 mb-1">Service %</label>
                      <input
                        type="number"
                        value={serviceChargePercent}
                        onChange={(e) => setServiceChargePercent(Number(e.target.value))}
                        className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs outline-none focus:border-red-500/60"
                        placeholder="0"
                      />
                    </div>

                    <div className="col-span-3">
                      <label className="block text-[11px] text-white/60 mb-1">Tax %</label>
                      <input
                        type="number"
                        value={taxPercent}
                        onChange={(e) => setTaxPercent(Number(e.target.value))}
                        className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs outline-none focus:border-red-500/60"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/10 space-y-1 text-xs text-white/70">
                    <Row
                      label="Discount"
                      value={`-£${checkoutTotals.discountAmount.toFixed(2)}`}
                    />
                    <Row
                      label="Service"
                      value={`£${checkoutTotals.serviceCharge.toFixed(2)}`}
                    />
                    <Row label="Tax" value={`£${checkoutTotals.taxAmount.toFixed(2)}`} />
                  </div>
                </section>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                  Create an order, then select it from{" "}
                  <span className="text-white">Open Orders</span> to take payment.
                </div>
              </>
            ) : (
              // In checkout mode, we don't show create order controls here
              <div className="text-xs text-white/60">
                Tip: Tap an order on the left to switch checkout. Tap “Back” to return to cart.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// -----------------------------
// Small UI helpers
// -----------------------------
function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <div className="text-white/60">{label}</div>
      <div className="text-white">{value}</div>
    </div>
  );
}

function MethodButton({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={[
        "rounded-xl py-2 text-xs font-semibold border transition active:scale-[0.98]",
        active
          ? "bg-red-500/15 border-red-500/50 text-white"
          : "bg-white/5 border-white/10 hover:bg-white/10 text-white/80",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// -----------------------------
// Toast system (modern UX)
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
