"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth, saveAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { resolveMediaUrl } from "@/lib/media";
import { kitchenSocket } from "@/lib/socket";

export default function PosPage() {
  const { settings } = useSettings();
  const logo = resolveMediaUrl(settings?.logoUrl) || "/logo.png";
  const brandName = settings?.brandName || "Kurda Restaurant";
  const brandTagline = settings?.brandTagline || "";
  const panelLocked = settings?.posPanelAlwaysVisible === true;
  const defaultOrderType = settings?.posDefaultOrderType || "dine_in";
  const showPosDiscounts = settings?.posShowDiscounts !== false;
  const showPosServiceCharge = settings?.posShowServiceCharge !== false;
  const showPosTax = settings?.posShowTax !== false;
  const discountColSpan =
    !showPosServiceCharge && !showPosTax ? "col-span-12" : "col-span-6";
  const serviceColSpan = showPosDiscounts
    ? showPosTax
      ? "col-span-3"
      : "col-span-6"
    : showPosTax
    ? "col-span-6"
    : "col-span-12";
  const taxColSpan = showPosDiscounts
    ? showPosServiceCharge
      ? "col-span-3"
      : "col-span-6"
    : showPosServiceCharge
    ? "col-span-6"
    : "col-span-12";
  // -----------------------------
  // Core state
  // -----------------------------
  const [user, setUser] = useState(null);
  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);

  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [addOrder, setAddOrder] = useState(null);
  const [showRight, setShowRight] = useState(false);

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  // Busy flags (prevents double-tap on tablet)
  const [placingOrder, setPlacingOrder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isAddingItems, setIsAddingItems] = useState(false);
  const [addSendToKitchen, setAddSendToKitchen] = useState(true);
  const [adminSendToKitchen, setAdminSendToKitchen] = useState(true);

  // Payment
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundSearch, setRefundSearch] = useState("");
  const [refundSearching, setRefundSearching] = useState(false);
  const [refundPin, setRefundPin] = useState("");
  const [printSearch, setPrintSearch] = useState("");
  const [printSearching, setPrintSearching] = useState(false);
  const [printPreview, setPrintPreview] = useState(null);

  // Security lock
  const [locked, setLocked] = useState(false);
  const [lockPin, setLockPin] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  // Confirm modal
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "Confirm",
    body: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
  });
  const confirmResolverRef = useRef(null);
  const [cancelPinOpen, setCancelPinOpen] = useState(false);
  const [cancelPinOrder, setCancelPinOrder] = useState(null);
  const [cancelPinValue, setCancelPinValue] = useState("");
  const [cancelPinLoading, setCancelPinLoading] = useState(false);

  // Discounts (used ONLY when building a new order from cart)
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [serviceChargePercent, setServiceChargePercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [autoHideReadyPos, setAutoHideReadyPos] = useState(true);
  const [posHideReadyMinutes, setPosHideReadyMinutes] = useState(10);
  const [now, setNow] = useState(Date.now());
  const [compactMode, setCompactMode] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchUsers, setSwitchUsers] = useState([]);
  const [switchQuery, setSwitchQuery] = useState("");
  const [switchSelected, setSwitchSelected] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [switchLoading, setSwitchLoading] = useState(false);
  const [promos, setPromos] = useState([]);
  const [selectedPromos, setSelectedPromos] = useState([]);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [printHealth, setPrintHealth] = useState({
    ok: true,
    reason: null,
    checkedAt: null,
  });
  const [currentGuest, setCurrentGuest] = useState(1);
  const maxGuests = 20;

  // Modern menu controls
  const [search, setSearch] = useState("");
  const [activeCatId, setActiveCatId] = useState(null);
  const [catSearch, setCatSearch] = useState("");

  // Favorites + Recent (POS speed)
  const [favorites, setFavorites] = useState([]);
  const [recent, setRecent] = useState([]);

  // Toasts
  const toast = useToasts();

  // Refs
  const searchRef = useRef(null);
  const addGuardRef = useRef(new Map());
  const cartGuardRef = useRef(new Map());
  const lastActivityRef = useRef(Date.now());

  // -----------------------------
  // Helpers: payments + totals
  // -----------------------------
  function calcOrderPaid(order) {
    const paymentsArr =
      order?.payments || order?.Payments || order?.payment || order?.Payment || [];
    if (!Array.isArray(paymentsArr)) return 0;
    return paymentsArr.reduce((s, p) => {
      const amt = Number(p.amount || 0);
      return p.kind === "refund" ? s - amt : s + amt;
    }, 0);
  }

  const menuItemsFlat = useMemo(() => {
    return (menu || []).flatMap((c) =>
      (c.items || []).map((it) => ({
        ...it,
        categoryId: c.id,
        categoryName: c.name,
      }))
    );
  }, [menu]);

  const menuItemById = useMemo(() => {
    return new Map(menuItemsFlat.map((it) => [it.id, it]));
  }, [menuItemsFlat]);

  const categoryById = useMemo(() => {
    return new Map((menu || []).map((c) => [c.id, c]));
  }, [menu]);

  function isSoupCategoryName(name) {
    const n = String(name || "").trim().toLowerCase();
    if (!n) return false;
    if (n.includes("soup")) return true;
    if (n.includes("shle")) return true;
    if (n.includes("شله")) return true;
    return false;
  }

  const DEFAULT_SOUP_FREE_NAMES = [
    "Chicken Qozi",
    "Lamb Kawrma",
    "Lamb Qozi",
    "Mixed Qozi",
    "Organic Chicken",
    "Special Qozi",
  ];

  const normalizeName = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const defaultSoupFreeSet = useMemo(() => {
    return new Set(DEFAULT_SOUP_FREE_NAMES.map((n) => normalizeName(n)));
  }, []);

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
        items: Array.isArray(raw.conditions?.items) ? raw.conditions.items : [],
        orderTypes: Array.isArray(raw.conditions?.orderTypes)
          ? raw.conditions.orderTypes
          : [],
        roles: Array.isArray(raw.conditions?.roles) ? raw.conditions.roles : [],
        days: Array.isArray(raw.conditions?.days)
          ? raw.conditions.days.map((d) => Number(d)).filter((d) => Number.isFinite(d))
          : [],
        time: raw.conditions?.time || null,
        tables: Array.isArray(raw.conditions?.tables) ? raw.conditions.tables : [],
      },
      actions: {
        freeItems: Array.isArray(raw.actions?.freeItems) ? raw.actions.freeItems : [],
        discounts: Array.isArray(raw.actions?.discounts) ? raw.actions.discounts : [],
        addItems: Array.isArray(raw.actions?.addItems) ? raw.actions.addItems : [],
        print: raw.actions?.print || {},
      },
    };
  }

  function normalizeRules(rules) {
    if (!Array.isArray(rules)) return [];
    return rules
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

    if (conditions.orderTypes?.length) checks.push(conditions.orderTypes.includes(ctx.orderType));
    if (conditions.roles?.length) checks.push(conditions.roles.includes(ctx.role));
    if (conditions.tables?.length) checks.push(conditions.tables.includes(ctx.tableId || ""));
    if (conditions.days?.length) checks.push(conditions.days.includes(ctx.now.getDay()));
    if (conditions.time) checks.push(matchesTimeRange(conditions.time, ctx.now));

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

  function computeDiscountForAction(itemsData, itemsWithMenu, action) {
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

  function applyPricingRulesPreview({ itemsWithMenu, itemsData, rules, ctx, menuItemById }) {
    let workingItems = itemsData.map((x) => ({ ...x }));
    let ruleDiscount = 0;
    const displayItems = itemsData.map((x) => ({ ...x, isRuleItem: false }));
    let addCount = 0;

    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
      const rule = rules[ruleIndex];
      if (!rule.enabled) continue;
      if (!ruleMatches(rule, ctx)) continue;

      const matchedQty = matchedQtyForRule(rule, ctx);

      for (const action of rule.actions.freeItems || []) {
        workingItems = applyFreeItems(workingItems, itemsWithMenu, action, matchedQty);
      }

      for (const action of rule.actions.discounts || []) {
        ruleDiscount += computeDiscountForAction(workingItems, itemsWithMenu, action);
      }

      const addItems = rule.actions.addItems || [];
      for (let actionIndex = 0; actionIndex < addItems.length; actionIndex += 1) {
        const action = addItems[actionIndex];
        const qty = Number(action.qty || 0);
        if (!action.itemId || qty <= 0) continue;
        const menuItem = menuItemById.get(action.itemId);
        if (!menuItem) continue;
        const base = Number(menuItem.basePrice || 0);
        const unit = action.free ? 0 : base;
        const total = unit * qty;
        const lineKey = `rule-${ruleIndex}-${actionIndex}-${addCount++}`;
        const guest = Number(action.guest || 1);

        workingItems.push({
          lineKey,
          menuItemId: menuItem.id,
          quantity: qty,
          notes: action.note || "",
          guest,
          unitPrice: unit,
          totalPrice: total,
        });
        itemsWithMenu.push({
          item: { menuItemId: menuItem.id, quantity: qty },
          menuItem,
        });
        displayItems.push({
          lineKey,
          id: menuItem.id,
          name: menuItem.name,
          basePrice: base,
          qty,
          guest,
          note: action.note || "",
          categoryId: menuItem.categoryId,
          isRuleItem: true,
          autoAdded: true,
        });
      }

      if (rule.applyMode === "first") break;
    }

    return { itemsData: workingItems, ruleDiscount, displayItems };
  }

  const defaultSoupRules = useMemo(() => {
    const qualifyingIds = menuItemsFlat
      .filter((it) => defaultSoupFreeSet.has(normalizeName(it.name)))
      .map((it) => it.id);
    const soupCategoryIds = (menu || [])
      .filter((c) => isSoupCategoryName(c.name))
      .map((c) => c.id);
    const soupCategoryId = soupCategoryIds[0];
    if (qualifyingIds.length === 0 || !soupCategoryId) return [];
    return [
      {
        name: "Default soup free rule",
        enabled: true,
        priority: 100,
        applyMode: "stack",
        conditions: {
          match: "any",
          items: qualifyingIds.map((id) => ({ kind: "item", id, minQty: 1 })),
        },
        actions: {
          freeItems: [
            {
              kind: "category",
              id: soupCategoryId,
              freeQty: 1,
              perMatchedItem: true,
            },
          ],
        },
      },
    ];
  }, [menu, menuItemsFlat, defaultSoupFreeSet]);

  const configuredRules = useMemo(() => normalizeRules(settings?.rules), [settings?.rules]);
  const effectiveRules = useMemo(() => {
    if (configuredRules.length === 0) return defaultSoupRules;
    if (defaultSoupRules.length === 0) return configuredRules;
    const soupCategoryId = defaultSoupRules[0]?.actions?.freeItems?.[0]?.id;
    const hasSoupFree = configuredRules.some((rule) =>
      (rule.actions?.freeItems || []).some(
        (action) => action.kind === "category" && action.id === soupCategoryId
      )
    );
    return hasSoupFree ? configuredRules : [...configuredRules, ...defaultSoupRules];
  }, [configuredRules, defaultSoupRules]);

  const pricingState = useMemo(() => {
    const itemsData = cart.map((item, idx) => {
      const qty = Number(item.qty || 0);
      const base = Number(item.basePrice || 0);
      return {
        lineKey: `cart-${idx}`,
        menuItemId: item.id,
        quantity: qty,
        notes: item.note || "",
        guest: Number(item.guest) || 1,
        unitPrice: base,
        totalPrice: base * qty,
        name: item.name,
        basePrice: base,
        qty,
        categoryId: item.categoryId,
      };
    });

    const itemsWithMenu = itemsData.map((x) => {
      const menuItem = menuItemById.get(x.menuItemId);
      if (menuItem) return { item: { menuItemId: x.menuItemId, quantity: x.quantity }, menuItem };
      const category = categoryById.get(x.categoryId);
      return {
        item: { menuItemId: x.menuItemId, quantity: x.quantity },
        menuItem: {
          id: x.menuItemId,
          name: x.name,
          basePrice: x.basePrice,
          categoryId: x.categoryId,
          category,
        },
      };
    });

    const ctx = {
      items: itemsWithMenu.map((x) => ({ ...x.item, menuItem: x.menuItem })),
      orderType: getOrderType(),
      role: user?.role || "pos",
      tableId: selectedTableId || null,
      now: new Date(),
    };

    const pricing = applyPricingRulesPreview({
      itemsWithMenu,
      itemsData,
      rules: effectiveRules,
      ctx,
      menuItemById,
    });

    const lineByKey = new Map(
      pricing.itemsData.map((line) => [line.lineKey, line])
    );

    const safeDiscount = Number(discountValue) || 0;
    const safeService = Number(serviceChargePercent) || 0;
    const safeTax = Number(taxPercent) || 0;

    const subtotal = pricing.itemsData.reduce(
      (sum, line) => sum + Number(line.totalPrice || 0),
      0
    );

    let manualDiscount = 0;
    if (showPosDiscounts) {
      if (discountType === "percent") manualDiscount = (subtotal * safeDiscount) / 100;
      else if (discountType === "fixed") manualDiscount = safeDiscount;
    }

    let discountAmount = manualDiscount + Number(pricing.ruleDiscount || 0);
    if (discountAmount > subtotal) discountAmount = subtotal;

    const serviceCharge = (subtotal - discountAmount) * (safeService / 100);
    const taxAmount = (subtotal - discountAmount + serviceCharge) * (safeTax / 100);
    const total = subtotal - discountAmount + serviceCharge + taxAmount;

    return {
      displayCart: pricing.displayItems,
      lineByKey,
      totals: {
        subtotal,
        manualDiscount,
        ruleDiscount: Number(pricing.ruleDiscount || 0),
        discountAmount,
        serviceCharge,
        taxAmount,
        total,
      },
    };
  }, [
    cart,
    menu,
    menuItemsFlat,
    menuItemById,
    categoryById,
    effectiveRules,
    user?.role,
    selectedTableId,
    discountType,
    discountValue,
    serviceChargePercent,
    taxPercent,
    defaultOrderType,
  ]);

  const cartTotals = pricingState.totals;
  const displayCart = pricingState.displayCart;
  const lineByKey = pricingState.lineByKey;

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

  const ALL_CAT_ID = "__all__";

  const displayCategories = useMemo(() => {
    const list = menu || [];
    const filtered = catSearch.trim()
      ? list.filter((c) =>
          String(c.name || "").toLowerCase().includes(catSearch.trim().toLowerCase())
        )
      : list;
    return [{ id: ALL_CAT_ID, name: "All Items", items: [] }, ...filtered];
  }, [menu, catSearch]);

  const activeCategory = useMemo(() => {
    if (!menu?.length) return null;
    if (activeCatId === ALL_CAT_ID) return { id: ALL_CAT_ID, name: "All Items", items: [] };
    return menu.find((c) => c.id === activeCatId) || { id: ALL_CAT_ID, name: "All Items", items: [] };
  }, [menu, activeCatId]);

  const visibleItems = useMemo(() => {
    let items = [];
    if (activeCategory?.id === ALL_CAT_ID) {
      for (const cat of menu || []) {
        for (const it of cat.items || []) items.push(it);
      }
      items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } else {
      items = activeCategory?.items ?? [];
    }
    if (!normalizedSearch) return items;
    const all = [];
    for (const cat of menu || []) {
      for (const it of cat.items || []) all.push(it);
    }
    return all.filter((it) => String(it.name || "").toLowerCase().includes(normalizedSearch));
  }, [activeCategory, normalizedSearch, menu]);

  const categoryShortcuts = useMemo(() => {
    const preferred = ["Mains", "Drinks", "Sides", "Salads", "Desserts"];
    const byName = new Map((menu || []).map((c) => [String(c.name || ""), c]));
    const picked = preferred.map((n) => byName.get(n)).filter(Boolean);
    if (picked.length > 0) return picked;
    return (menu || []).slice(0, 5);
  }, [menu]);

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

  const cartItemIds = useMemo(() => {
    return cart.map((c) => c.id);
  }, [cart]);

  const cartCategoryIds = useMemo(() => {
    return cart.map((c) => c.categoryId).filter(Boolean);
  }, [cart]);

  const eligiblePromos = useMemo(() => {
    if (!promos || promos.length === 0) return [];
    const cartItemsSet = new Set(cartItemIds);
    const cartCatsSet = new Set(cartCategoryIds);
    return promos.filter((p) => {
      const itemIds = (p.items || []).map((i) => i.menuItemId);
      const catIds = (p.categories || []).map((c) => c.categoryId);
      if (itemIds.length === 0 && catIds.length === 0) return true;
      const itemMatch = itemIds.some((id) => cartItemsSet.has(id));
      const catMatch = catIds.some((id) => cartCatsSet.has(id));
      return itemMatch || catMatch;
    });
  }, [promos, cartItemIds, cartCategoryIds]);

  useEffect(() => {
    if (selectedPromos.length === 0) return;
    const eligibleIds = new Set(eligiblePromos.map((p) => p.id));
    setSelectedPromos((prev) => prev.filter((p) => eligibleIds.has(p.id)));
  }, [eligiblePromos, selectedPromos.length]);

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
  // Print bridge health (every 15s)
  // -----------------------------
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await api.get("/health/print-bridge");
        if (!alive) return;
        setPrintHealth({
          ok: Boolean(res?.data?.ok),
          reason: res?.data?.reason || res?.data?.error || null,
          checkedAt: Date.now(),
        });
      } catch (_err) {
        if (!alive) return;
        setPrintHealth({
          ok: false,
          reason: "unreachable",
          checkedAt: Date.now(),
        });
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

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

  useEffect(() => {
    if (!user || !["admin", "manager"].includes(user.role)) return;
    api
      .get("/promotions/active")
      .then((res) => setPromos(res.data || []))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!settings) return;
    if (typeof settings.posCompactDefault === "boolean") {
      setCompactMode(settings.posCompactDefault);
    }
    if (settings.posPanelAlwaysVisible === true) {
      setShowRight(true);
    }
    if (typeof settings.posShowPanelDefault === "boolean" && cart.length === 0 && !selectedOrder) {
      setShowRight(settings.posShowPanelDefault);
    }
    if (typeof settings.posAutoShowPanel === "boolean") {
      // store in state by using showRight logic in addToCart
    }
    if (typeof settings.posHideReadyMinutes === "number") {
      setPosHideReadyMinutes(settings.posHideReadyMinutes);
    }
    if (typeof settings.defaultServiceChargePercent === "number") {
      setServiceChargePercent(settings.defaultServiceChargePercent);
    }
    if (typeof settings.defaultTaxPercent === "number") {
      setTaxPercent(settings.defaultTaxPercent);
    }
    if (settings.posShowServiceCharge === false) {
      setServiceChargePercent(0);
    }
    if (settings.posShowTax === false) {
      setTaxPercent(0);
    }
    if (typeof settings.paymentDefaultMethod === "string") {
      setPaymentMethod(settings.paymentDefaultMethod);
    }
    if (settings.posShowDiscounts === false) {
      setDiscountType("none");
      setDiscountValue(0);
    }
  }, [settings]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const mark = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "touchmove"];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const timer = setInterval(() => {
      const nowTs = Date.now();
      const idleMs = nowTs - lastActivityRef.current;
      const lockMinutes = Number(settings?.securityInactivityLockMinutes || 0);
      const logoutMinutes = Number(settings?.securityInactivityLogoutMinutes || 0);

      if (logoutMinutes > 0 && idleMs > logoutMinutes * 60 * 1000) {
        clearAuth();
        window.location.href = "/login";
        return;
      }
      if (lockMinutes > 0 && idleMs > lockMinutes * 60 * 1000) {
        setLocked(true);
      }
    }, 2000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(timer);
    };
  }, [settings]);

  useEffect(() => {
    const coarse = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
    const touch = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
    setIsTouchDevice(coarse || touch);
  }, []);

  async function loadInitialData() {
    try {
      setLoading(true);
      const [tablesRes, menuRes] = await Promise.all([api.get("/tables"), api.get("/menu")]);
      const tablesData = tablesRes.data || [];
      const menuData = menuRes.data || [];

      setTables(tablesData);
      setMenu(menuData);

      setActiveCatId(ALL_CAT_ID);

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
    // Guard against accidental double-tap / duplicate click
    const nowMs = Date.now();
    const lastMs = addGuardRef.current.get(item.id) || 0;
    if (nowMs - lastMs < 160) return;
    addGuardRef.current.set(item.id, nowMs);

    if (
      settings?.posRequireTableSelection &&
      defaultOrderType === "dine_in" &&
      !selectedTableId
    ) {
      toast.error("Select a table first");
      return;
    }

    pushRecent(item);
    if (settings?.posAutoShowPanel !== false) setShowRight(true);

    // If user is currently checking out an existing order,
    // keep it, but adding items should typically mean "new order".
    // So we clear selectedOrder so right panel shows cart again.
    if (selectedOrder) setSelectedOrder(null);

    setCart((prev) => {
      const existing = prev.find(
        (c) => c.id === item.id && c.guest === currentGuest && !c.note
      );
      if (existing) {
        return prev.map((c) =>
          c.id === item.id && c.guest === currentGuest && !c.note
            ? { ...c, qty: c.qty + 1 }
            : c
        );
      }
      return [...prev, { ...item, qty: 1, note: "", guest: currentGuest }];
    });
  }

  function removeOneFromCart(item) {
    setCart((prev) => {
      const idx = prev.findIndex(
        (c) => c.id === item.id && c.guest === currentGuest && !c.note
      );
      if (idx === -1) return prev;
      const copy = [...prev];
      if (copy[idx].qty <= 1) copy.splice(idx, 1);
      else copy[idx] = { ...copy[idx], qty: copy[idx].qty - 1 };
      return copy;
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

  function handleCartAdjust(itemId, index, delta, e) {
    if (e?.preventDefault) e.preventDefault();
    if (e?.stopPropagation) e.stopPropagation();
    // Strong guard for Safari ghost clicks/taps
    const key = `${itemId}:${delta}`;
    const nowMs = Date.now();
    const lastMs = cartGuardRef.current.get(key) || 0;
    if (nowMs - lastMs < 600) return;
    cartGuardRef.current.set(key, nowMs);
    changeCartQty(index, delta);
  }

  function clearCart() {
    if (cart.length === 0) return;
    askConfirm({
      title: "Clear cart",
      body: "Remove all items from the cart?",
      confirmText: "Clear",
    }).then((ok) => {
      if (!ok) return;
      setCart([]);
      if (!selectedOrder && !panelLocked && !settings?.posShowPanelDefault) {
        setShowRight(false);
      }
      toast.info("Cart cleared");
    });
  }

  // -----------------------------
  // Create order
  // -----------------------------
  async function createOrder() {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (
      settings?.posRequireTableSelection &&
      getOrderType() === "dine_in" &&
      !selectedTableId
    ) {
      toast.error("Select a table before creating a dine-in order");
      return;
    }

    try {
      setPlacingOrder(true);

      const body = {
        type: getOrderType(),
        tableId: selectedTableId,
        notes: "",
        subtotal: Number(cartTotals.subtotal.toFixed(2)),
        discountAmount: Number(cartTotals.manualDiscount.toFixed(2)),
        taxAmount: Number(cartTotals.taxAmount.toFixed(2)),
        serviceCharge: Number(cartTotals.serviceCharge.toFixed(2)),
        total: Number(cartTotals.total.toFixed(2)),
        promotionIds: selectedPromos.map((p) => p.id),
        sendToKitchen: user?.role === "admin" ? adminSendToKitchen : true,
        items: cart.map((c) => ({
          menuItemId: c.id,
          quantity: c.qty,
          notes: c.note || "",
          guest: Number(c.guest) || 1,
        })),
      };

      const res = await api.post("/orders", body);

      await loadOrders();

      // Clear cart (new order is now created)
      setCart([]);
      setSelectedPromos([]);

      toast.success(
        user?.role === "admin" && !adminSendToKitchen
          ? "Order created (not sent to kitchen)"
          : "Order created and sent to kitchen"
      );

      // IMPORTANT: switch right panel to Checkout for this order
      setSelectedOrder(res.data);

      // Nice UX: keep selected table matching the order
      setSelectedTableId(res.data?.tableId || selectedTableId);

    } catch (err) {
      console.error(err);
      toast.error("Failed to create order");
    } finally {
      setPlacingOrder(false);
    }
  }

  // -----------------------------
  // Edit existing order (add/remove)
  // -----------------------------
  function loadOrderIntoCart(order) {
    if (!order) return;
    const items = (order.items || []).map((it) => ({
      id: it.menuItemId,
      name: it.menuItem?.name || "Item",
      basePrice: Number(it.menuItem?.basePrice || it.unitPrice || 0),
      categoryId: it.menuItem?.categoryId || null,
      imageUrl: it.menuItem?.imageUrl || "",
      qty: Number(it.quantity || 0),
      note: it.notes || "",
      guest: Number(it.guest) || 1,
      orderItemId: it.id,
    }));
    setCart(items);
    setSelectedPromos([]);
  }

  async function updateOrderItems() {
    if (!addOrder) return;
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    try {
      setIsAddingItems(true);
      const body = {
        items: cart.map((c) => ({
          menuItemId: c.id,
          quantity: c.qty,
          notes: c.note || "",
          guest: Number(c.guest) || 1,
          orderItemId: c.orderItemId || undefined,
        })),
        sendToKitchen: addSendToKitchen,
      };
      const res = await api.post(`/orders/${addOrder.id}/update-items`, body);
      toast.success("Order updated");
      setCart([]);
      setSelectedPromos([]);
      setAddOrder(null);
      setSelectedOrder(res.data || null);
      await loadOrders();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update order");
    } finally {
      setIsAddingItems(false);
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
  async function addPayment({ printAfter = false } = {}) {
    if (!selectedOrder) return;

    const amt = Number(paymentAmount);
    if (Number.isNaN(amt) || amt < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!settings?.paymentAllowZero && amt === 0) {
      toast.error("Zero-amount payments are disabled");
      return;
    }

    // Optional: prevent paying more than remaining
    if (!settings?.paymentAllowOverpay && amt > checkoutTotals.remaining + 0.0001) {
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
      // Pull fresh order to avoid stale totals
      const fresh = await api.get(`/orders/${selectedOrder.id}`);
      const freshOrder = fresh.data;
      setSelectedOrder(freshOrder);
      const paid = calcOrderPaid(freshOrder);
      const total = Number(freshOrder.total || 0);
      const remaining = Math.max(0, total - paid);
      if (freshOrder.status === "paid" || remaining <= 0.001) {
        if (printAfter) {
          printOrderReceipt(freshOrder);
        }
        setSelectedOrder(null);
        if (!panelLocked && !settings?.posShowPanelDefault && cart.length === 0) {
          setShowRight(false);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to record payment");
      setPaymentAmount(String(amt.toFixed(2)));
    } finally {
      setIsPaying(false);
    }
  }

  async function addRefund() {
    if (!selectedOrder) return;

    const amt = Number(refundAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid refund amount");
      return;
    }
    if (settings?.refundMaxAmount && Number(settings.refundMaxAmount) > 0) {
      if (amt > Number(settings.refundMaxAmount)) {
        toast.error(`Refund exceeds max: £${Number(settings.refundMaxAmount).toFixed(2)}`);
        return;
      }
    }
    if (settings?.refundRequireManagerPin && refundPin.length !== 4) {
      toast.error("Enter manager PIN to refund");
      return;
    }

    const ok = await askConfirm({
      title: "Confirm refund",
      body: "Are you sure you want to refund this amount?",
      confirmText: "Refund",
    });
    if (!ok) return;

    try {
      setIsRefunding(true);
      setRefundAmount("");
      await api.post(`/payments/orders/${selectedOrder.id}/refund`, {
        amount: amt,
        method: refundMethod,
        managerPin: settings?.refundRequireManagerPin ? refundPin : undefined,
      });
      toast.success("Refund recorded");
      await loadOrders();
      setRefundPin("");
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || "Failed to record refund";
      toast.error(msg);
      setRefundAmount(String(amt.toFixed(2)));
    } finally {
      setIsRefunding(false);
    }
  }

  async function findOrderForRefund() {
    const q = refundSearch.trim().replace(/^#/, "");
    if (!q) return;
    setRefundSearching(true);
    try {
      // try quick match against loaded orders by prefix
      const local = openOrders.find((o) => String(o.id).startsWith(q));
      if (local) {
        setSelectedOrder(local);
        toast.info("Order loaded");
        return;
      }
      const res = await api.get(`/orders/lookup`, { params: { q } });
      setSelectedOrder(res.data);
      toast.info("Order loaded");
    } catch (e) {
      toast.error("Order not found. Paste full order ID.");
    } finally {
      setRefundSearching(false);
    }
  }

  async function findOrderForPrint() {
    const q = printSearch.trim().replace(/^#/, "");
    if (!q) return;
    setPrintSearching(true);
    try {
      const local = openOrders.find((o) => String(o.id).startsWith(q));
      if (local) {
        setPrintPreview(local);
        toast.info("Order loaded. Review then print.");
        return;
      }
      const res = await api.get(`/orders/lookup`, { params: { q } });
      setPrintPreview(res.data);
      toast.info("Order loaded. Review then print.");
    } catch (e) {
      toast.error("Order not found. Paste full order ID.");
    } finally {
      setPrintSearching(false);
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  async function openSwitch() {
    setSwitchOpen(true);
    setSwitchSelected(null);
    setPinInput("");
    try {
      const res = await api.get("/auth/switch-users");
      setSwitchUsers(res.data || []);
    } catch (e) {
      toast.error("Failed to load users");
    }
  }

  async function doPinLogin() {
    if (!switchSelected || pinInput.length !== 4) return;
    try {
      setSwitchLoading(true);
      const res = await api.post("/auth/pin-login", {
        username: switchSelected.username,
        pin: pinInput,
      });
      saveAuth(res.data.token, res.data.user);
      window.location.href = "/pos";
    } catch (e) {
      const msg = e?.response?.data?.message || "Invalid PIN";
      toast.error(msg);
    } finally {
      setSwitchLoading(false);
    }
  }

  async function unlockWithPin() {
    if (!user?.username || lockPin.length !== 4) return;
    try {
      setUnlocking(true);
      const res = await api.post("/auth/pin-login", {
        username: user.username,
        pin: lockPin,
      });
      saveAuth(res.data.token, res.data.user);
      setLocked(false);
      setLockPin("");
      lastActivityRef.current = Date.now();
    } catch (e) {
      const msg = e?.response?.data?.message || "Invalid PIN";
      toast.error(msg);
    } finally {
      setUnlocking(false);
    }
  }

  function formatTime(d) {
    try {
      return new Date(d).toLocaleString();
    } catch {
      return "";
    }
  }

  function getPaymentsForSelected() {
    const paymentsArr =
      selectedOrder?.payments || selectedOrder?.Payments || selectedOrder?.payment || selectedOrder?.Payment || [];
    if (!Array.isArray(paymentsArr)) return [];
    return [...paymentsArr].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  function getOrderType() {
    if (selectedTableId) return "dine_in";
    return "takeaway";
  }

  function printRefundReceipt(refund) {
    if (!refund || !selectedOrder) return;
    const orderId = String(selectedOrder.id || "").slice(0, 8);
    const currency = "£";
    const paperWidth = settings?.receiptPaperSize === "58mm" ? 220 : 300;
    const show = {
      logo: settings?.receiptShowLogo !== false,
      brandName: settings?.receiptShowBrandName !== false,
      orderId: settings?.receiptShowOrderId !== false,
      tableType: settings?.receiptShowTableType !== false,
      takenBy: settings?.receiptShowTakenBy !== false,
      time: settings?.receiptShowTime !== false,
      items: settings?.receiptShowItems !== false,
      itemNotes: settings?.receiptShowItemNotes !== false,
      totals: settings?.receiptShowTotals !== false,
      discounts: settings?.receiptShowDiscounts !== false,
      balance: settings?.receiptShowBalance !== false,
      method: settings?.receiptShowPaymentMethod !== false,
      footer: settings?.receiptShowFooter !== false,
      address: settings?.receiptShowAddress === true,
      phone: settings?.receiptShowPhone === true,
    };
    const html = `
      <html>
        <head>
          <title>Refund Receipt</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 12px; color: #111; }
            .receipt { width: ${paperWidth}px; margin: 0 auto; }
            .center { text-align: center; }
            .title { font-size: 16px; font-weight: 700; margin: 4px 0; }
            .muted { color: #555; font-size: 11px; }
            .divider { border-top: 1px dashed #aaa; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
            .items .row { margin: 4px 0; }
            .qty { min-width: 24px; }
            .name { flex: 1; }
            .amount { min-width: 64px; text-align: right; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              ${show.logo ? `<img src="${logo}" alt="Logo" style="width:48px;height:48px;object-fit:cover;border-radius:10px;" />` : ""}
              ${show.brandName ? `<div class="title">${settings?.brandName || "Kurda Restaurant"}</div>` : ""}
              ${settings?.receiptHeaderText ? `<div class="muted">${settings.receiptHeaderText}</div>` : ""}
              ${show.address && settings?.receiptAddress ? `<div class="muted">${settings.receiptAddress}</div>` : ""}
              ${show.phone && settings?.receiptPhone ? `<div class="muted">${settings.receiptPhone}</div>` : ""}
              <div class="title">Refund Receipt</div>
            </div>

            <div class="divider"></div>
            ${show.orderId ? `<div class="row"><div>Order</div><div>#${orderId}</div></div>` : ""}
            ${show.tableType ? `<div class="row"><div>${selectedOrder.type === "dine_in" ? "Table" : "Type"}</div><div>${selectedOrder.type === "dine_in" ? (selectedOrder.table?.name || "-") : "Takeaway"}</div></div>` : ""}
            ${show.takenBy && selectedOrder.openedByUser ? `<div class="row"><div>Cashier</div><div>${selectedOrder.openedByUser.fullName || selectedOrder.openedByUser.username}</div></div>` : ""}
            ${show.time ? `<div class="row"><div>Time</div><div>${formatTime(refund.createdAt)}</div></div>` : ""}
            ${show.method ? `<div class="row"><div>Method</div><div>${refund.method}</div></div>` : ""}

            ${show.items ? `
              <div class="divider"></div>
              <div class="items">
                ${(selectedOrder.items || []).map((it) => `
                  <div class="row">
                    <div class="qty">${it.quantity}x</div>
                    <div class="name">${(it.menuItem && it.menuItem.name) || "Item"}</div>
                    <div class="amount">${currency}${Number(it.totalPrice || (it.quantity * it.unitPrice) || 0).toFixed(2)}</div>
                  </div>
                  ${show.itemNotes && it.notes ? `<div class="muted" style="margin-left:24px;">${it.notes}</div>` : ""}
                `).join("")}
              </div>
            ` : ""}

            ${show.totals ? `
              <div class="divider"></div>
              ${show.discounts ? `<div class="row"><div>Discount</div><div>-${currency}${Number(selectedOrder.discountAmount || 0).toFixed(2)}</div></div>` : ""}
              <div class="row"><div>Total</div><div>${currency}${Number(selectedOrder.total || 0).toFixed(2)}</div></div>
              <div class="row"><div>Paid</div><div>${currency}${checkoutTotals.paid.toFixed(2)}</div></div>
              ${show.balance ? `<div class="row"><div>Balance</div><div>${currency}${checkoutTotals.remaining.toFixed(2)}</div></div>` : ""}
            ` : ""}
            <div class="row"><div>Refund</div><div>${currency}${Number(refund.amount || 0).toFixed(2)}</div></div>
            ${show.footer ? `<div class="divider"></div><div class="center muted">${settings?.receiptFooterText || "Thank you!"}</div>` : ""}
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;
    const win = window.open("", "refund_receipt", "width=400,height=600");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  async function printOrderReceipt(order) {
    if (!order) return;
    try {
      await api.post(`/orders/${order.id}/print-receipt`);
      toast.success("Receipt sent to printer");
    } catch (err) {
      console.error(err);
      toast.error("Failed to print receipt");
    }
  }

  async function deleteOrderById(orderId) {
    if (!orderId) return;
    const ok = await askConfirm({
      title: "Delete order?",
      body: "This will permanently delete the order and its payments. Admin only.",
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!ok) return;

    try {
      await api.delete(`/orders/${orderId}`);
      toast.success("Order deleted");
      setPrintPreview(null);
      setPrintSearch("");
      await loadOrders();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete order");
    }
  }

  async function cancelOpenOrder(order) {
    const ok = await askConfirm({
      title: "Cancel order?",
      body: "This will cancel the order and remove it from Open Orders.",
      confirmText: "Cancel order",
      cancelText: "Back",
    });
    if (!ok) return;

    setCancelPinValue("");
    setCancelPinOrder(order);
    setCancelPinOpen(true);
  }

  async function confirmLeaveUnpaid() {
    if (!selectedOrder) return true;
    if (checkoutTotals.paid > 0.001 && checkoutTotals.remaining > 0.001) {
      return await askConfirm({
        title: "Unpaid balance",
        body: "This order still has a balance. Switch anyway?",
        confirmText: "Switch",
      });
    }
    return true;
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
  const headerOrderLabel = selectedTableName
    ? `Table: ${selectedTableName}`
    : "Takeaway";

  function statusTone(status) {
    if (status === "ready") return "bg-emerald-500/20 border-emerald-500/40 text-emerald-100";
    if (status === "in_progress") return "bg-white/10 border-white/20 text-white";
    if (status === "sent_to_kitchen") return "bg-red-500/15 border-red-500/30 text-red-100";
    if (status === "paid") return "bg-emerald-500/15 border-emerald-500/30 text-emerald-100";
    return "bg-white/5 border-white/10 text-white/70";
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {switchOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/90 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-lg font-semibold">Switch User</div>
                <div className="text-xs text-white/60">Select user and enter PIN</div>
              </div>
              <button
                onClick={() => setSwitchOpen(false)}
                className="px-3 py-2 rounded-xl text-xs bg-white/10 hover:bg-white/15"
              >
                Close
              </button>
            </div>

            <input
              value={switchQuery}
              onChange={(e) => setSwitchQuery(e.target.value)}
              placeholder="Search user..."
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
            />

            <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
              {switchUsers
                .filter((u) =>
                  `${u.fullName} ${u.username}`.toLowerCase().includes(switchQuery.trim().toLowerCase())
                )
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSwitchSelected(u);
                      setPinInput("");
                    }}
                    className={[
                      "w-full text-left rounded-xl border px-3 py-2 text-sm transition",
                      switchSelected?.id === u.id
                        ? "border-red-500/50 bg-red-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <div className="font-semibold">{u.fullName}</div>
                    <div className="text-xs text-white/60">@{u.username} • {u.role}</div>
                  </button>
                ))}
            </div>

            <div className="mt-4">
              <input
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Enter 4-digit PIN"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
                inputMode="numeric"
              />
              <button
                onClick={doPinLogin}
                disabled={!switchSelected || pinInput.length !== 4 || switchLoading}
                className="mt-3 w-full rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/40"
              >
                {switchLoading ? "Switching..." : "Switch"}
              </button>
            </div>
          </div>
        </div>
      )}
      {locked && (
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-black/90 p-4">
            <div className="text-lg font-semibold mb-1">POS Locked</div>
            <div className="text-xs text-white/60 mb-3">Enter your PIN to unlock</div>
            <input
              value={lockPin}
              onChange={(e) => setLockPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4-digit PIN"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              inputMode="numeric"
            />
            <button
              onClick={unlockWithPin}
              disabled={lockPin.length !== 4 || unlocking}
              className="mt-3 w-full rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/40"
            >
              {unlocking ? "Unlocking..." : "Unlock"}
            </button>
          </div>
        </div>
      )}
      {cancelPinOpen && (
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-black/90 p-4">
            <div className="text-lg font-semibold mb-1">Manager PIN Required</div>
            <div className="text-xs text-white/60 mb-3">
              Enter a manager PIN to cancel this order.
            </div>
            <input
              value={cancelPinValue}
              onChange={(e) => setCancelPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4-digit PIN"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              inputMode="numeric"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  if (cancelPinLoading) return;
                  setCancelPinOpen(false);
                  setCancelPinOrder(null);
                }}
                className="flex-1 rounded-xl py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10"
              >
                Back
              </button>
              <button
                onClick={async () => {
                  if (!cancelPinOrder || cancelPinValue.length !== 4) return;
                  setCancelPinLoading(true);
                  try {
                    await api.post(`/orders/${cancelPinOrder.id}/cancel`, {
                      managerPin: String(cancelPinValue),
                    });
                    toast.success("Order cancelled");
                    if (selectedOrder?.id === cancelPinOrder.id) setSelectedOrder(null);
                    setCancelPinOpen(false);
                    setCancelPinOrder(null);
                    await loadOrders();
                  } catch (err) {
                    const msg = err?.response?.data?.message || "Failed to cancel order";
                    toast.error(msg);
                  } finally {
                    setCancelPinLoading(false);
                  }
                }}
                disabled={cancelPinValue.length !== 4 || cancelPinLoading}
                className="flex-1 rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/40"
              >
                {cancelPinLoading ? "Cancelling..." : "Cancel order"}
              </button>
            </div>
          </div>
        </div>
      )}
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
      <ToastStack toasts={toast.toasts} remove={toast.remove} />

      {/* Top header */}
      <header
        className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur"
        style={
          settings?.posShowHeaderImage && settings?.headerImageUrl
            ? {
                backgroundImage: `linear-gradient(0deg, rgba(0,0,0,0.85), rgba(0,0,0,0.85)), url(${resolveMediaUrl(
                  settings.headerImageUrl
                )})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className={["flex items-center justify-between", compactMode ? "px-4 py-3" : "px-5 py-4"].join(" ")}>
          <div className="flex items-center gap-3">
            <div className={["rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden", compactMode ? "w-9 h-9" : "w-10 h-10"].join(" ")}>
              <img src={logo} alt="Kurda Restaurant" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className={["font-semibold tracking-tight", compactMode ? "text-base" : "text-lg"].join(" ")}>{brandName}</div>
              <div className="text-xs text-white/60">
                {headerOrderLabel} • Orders: {openOrders.length} • Press “/” to search
              </div>
              <div className="sm:hidden text-[11px] text-white/60">
                Printer: {printHealth.ok ? "Online" : "Offline"}
              </div>
              {brandTagline ? (
                <div className="text-[11px] text-white/50">{brandTagline}</div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-white/70">
              <span
                className={[
                  "inline-block w-2.5 h-2.5 rounded-full",
                  printHealth.ok ? "bg-emerald-400" : "bg-red-400",
                ].join(" ")}
              />
              <span>
                Printer {printHealth.ok ? "Online" : "Offline"}
              </span>
            </div>
            <label className="hidden md:flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={autoHideReadyPos}
                onChange={(e) => setAutoHideReadyPos(e.target.checked)}
              />
              Hide Ready 10m+
            </label>
            <label className="hidden md:flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(e) => setCompactMode(e.target.checked)}
              />
              Compact
            </label>
            {["admin", "manager"].includes(user?.role) && (
              <div className="hidden md:flex items-center gap-2">
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
              </div>
            )}

            <div className="text-right">
              <div className="font-medium">{user?.fullName}</div>
              <div className="text-xs text-white/60">{user?.role}</div>
            </div>

            <button
              onClick={() => {
                if (panelLocked) return;
                setShowRight((v) => !v);
              }}
              className={[
                "px-4 py-2 rounded-xl active:scale-[0.98] transition text-xs font-semibold",
                panelLocked ? "bg-white/5 text-white/40 cursor-not-allowed" : "bg-white/10 hover:bg-white/15",
              ].join(" ")}
              type="button"
            >
              {panelLocked ? "Panel Locked" : showRight || cart.length > 0 || selectedOrder ? "Hide Panel" : "Show Panel"}
            </button>

            {settings?.securityAllowUserSwitching !== false && (
              <button
                onClick={openSwitch}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.98] transition text-xs font-semibold"
                type="button"
              >
                Switch User
              </button>
            )}

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
      <div
        className={[
          "grid grid-cols-1 xl:grid-cols-12 overflow-x-hidden",
          compactMode
            ? "gap-3 p-3 min-h-[calc(100vh-72px)] xl:h-[calc(100vh-72px)]"
            : "gap-4 p-4 min-h-[calc(100vh-81px)] xl:h-[calc(100vh-81px)]",
        ].join(" ")}
      >
        {/* LEFT: tables + orders */}
        <aside className="order-3 xl:order-none col-span-12 xl:col-span-3 rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col min-w-0">
          <div className={["border-b border-white/10", compactMode ? "px-3 py-2" : "px-4 py-3"].join(" ")}>
            <div className={["font-semibold", compactMode ? "text-xs" : "text-sm"].join(" ")}>Tables</div>
            <div className="text-xs text-white/60">Tap to select / deselect</div>
          </div>

          <div className={["space-y-4 overflow-y-auto overscroll-contain touch-pan-y", compactMode ? "p-3" : "p-4"].join(" ")}>
            <div
              className={[
                "grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-3",
                compactMode ? "gap-1.5" : "gap-2",
              ].join(" ")}
            >
              {[...tables]
                .sort((a, b) => {
                  const an = Number(String(a.name).replace(/\D/g, "")) || 0;
                  const bn = Number(String(b.name).replace(/\D/g, "")) || 0;
                  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
                  const ai = order.indexOf(an);
                  const bi = order.indexOf(bn);
                  if (ai !== -1 || bi !== -1) {
                    if (ai === -1) return 1;
                    if (bi === -1) return -1;
                    return ai - bi;
                  }
                  return an - bn;
                })
                .map((t) => {
                const active = selectedTableId === t.id;
                const hasOpenOrder = openOrders.some(
                  (o) => (o.table?.id || o.tableId) === t.id
                );
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTableId(active ? null : t.id);
                      // if you're in checkout, stay there; table selection is for creating new orders
                    }}
                    className={[
                      "rounded-xl border text-xs font-medium transition active:scale-[0.98]",
                      compactMode ? "px-2 py-1.5" : "px-3 py-2",
                      active
                        ? "border-red-500/60 bg-red-500/15 text-white"
                        : hasOpenOrder
                        ? "border-amber-400/50 bg-amber-400/15 text-amber-100"
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
                <div className={["font-semibold", compactMode ? "text-xs" : "text-sm"].join(" ")}>Open Orders</div>
                <button
                  onClick={loadOrders}
                  className="text-xs text-white/60 hover:text-white"
                  type="button"
                >
                  Refresh
                </button>
              </div>

              <div className={["space-y-2", compactMode ? "text-xs" : ""].join(" ")}>
                {openOrders
                  .filter((o) => {
                    if (!autoHideReadyPos) return true;
                    if (o.status !== "ready") return true;
                    const updated = new Date(o.updatedAt || o.createdAt || Date.now()).getTime();
                    return now - updated <= posHideReadyMinutes * 60 * 1000;
                  })
                  .map((order) => {
                  const isSelected = selectedOrder?.id === order.id;
                  const items = order.items || [];
                  const itemsPreview = items.slice(0, compactMode ? 2 : 4);
                  return (
                    <button
                      key={order.id}
                      onClick={async () => {
                        // Selecting an order = enter Checkout mode
                        if (!(await confirmLeaveUnpaid())) return;
                        setSelectedOrder(order);
                        if (settings?.posAutoOpenCheckout !== false) {
                          setShowRight(true);
                        }

                        // sync table label for header UX
                        setSelectedTableId(order?.table?.id || order?.tableId || null);

                        // (optional) clear cart so you don't confuse cashier
                        // setCart([]);
                      }}
                      className={[
                        "w-full text-left rounded-2xl border transition active:scale-[0.99]",
                        compactMode ? "p-2" : "p-3",
                        isSelected
                          ? "border-red-500/50 bg-red-500/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10",
                      ].join(" ")}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-white">
                              {order.type === "dine_in"
                                ? `Table ${order.table?.name || "?"}`
                                : "Takeaway"}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-white/50">
                              {order.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-white/60 mt-0.5">
                            Order #{String(order.id).slice(0, 6)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-white/90 text-sm font-semibold">
                            £{Number(order.total || 0).toFixed(2)}
                          </div>
                          <div className="text-[11px] text-white/50">
                            Items: {items.reduce((s, it) => s + Number(it.quantity || 0), 0)}
                          </div>
                        </div>
                      </div>

                      <div
                        className={[
                          "mt-2 space-y-1 text-[11px] text-white/80",
                          compactMode ? "max-h-28" : "max-h-40",
                          "overflow-y-auto pr-1",
                        ].join(" ")}
                      >
                        {items.map((it, idx) => (
                          <div key={`${it.id || idx}`} className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-white/80">{it.quantity}×</span>{" "}
                              <span className="inline-block max-w-full whitespace-normal break-words">
                                {it.menuItem?.name || "Item"}
                              </span>
                            </div>
                            <div className="text-white/50 shrink-0">
                              £{Number(it.totalPrice || 0).toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2">
                        <span
                          className={[
                            "inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                            statusTone(order.status),
                          ].join(" ")}
                        >
                          {order.status}
                        </span>
                        {order.openedByUser && (
                          <span className="ml-2 text-[10px] text-white/60">
                            by {order.openedByUser.fullName || order.openedByUser.username}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (selectedOrder && !(await confirmLeaveUnpaid())) return;
                            setSelectedOrder(null);
                            setAddOrder(order);
                            loadOrderIntoCart(order);
                            setSelectedPromos([]);
                            setSelectedTableId(order?.table?.id || order?.tableId || null);
                            setShowRight(true);
                            setAddSendToKitchen(true);
                          }}
                        className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-white/10 border border-white/10 hover:bg-white/15"
                        >
                          Edit order
                        </button>
                        {order.status !== "paid" && order.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelOpenOrder(order);
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-amber-500/80 hover:bg-amber-500"
                          >
                            Cancel
                          </button>
                        )}
                        {user?.role === "admin" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteOrderById(order.id);
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-red-600/80 hover:bg-red-600"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* MIDDLE: categories + items */}
        <main
          className={[
            "order-1 xl:order-none rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col md:flex-row",
            showRight || cart.length > 0 || selectedOrder
              ? "col-span-12 xl:col-span-6"
              : "col-span-12 xl:col-span-9",
          ].join(" ")}
        >
          {/* Categories list (NO horizontal scroll) */}
          <div className="w-full md:w-60 md:border-r border-white/10 border-b md:border-b-0 bg-black/20 flex flex-col">
            <div className={["border-b border-white/10", compactMode ? "px-3 py-2" : "px-4 py-3"].join(" ")}>
              <div className={["font-semibold", compactMode ? "text-xs" : "text-sm"].join(" ")}>Categories</div>
              <div className="text-xs text-white/60">Select to filter items</div>
            </div>

            <div
              className={[
                "flex flex-col gap-2 overflow-y-auto overscroll-contain touch-pan-y flex-1",
                compactMode ? "p-1.5" : "p-2",
              ].join(" ")}
            >
              <div className={["mb-2", compactMode ? "px-1" : "px-2"].join(" ")}>
                <input
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  placeholder="Search categories..."
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs outline-none focus:border-red-500/60"
                />
              </div>
              {(displayCategories || []).map((cat) => {
                const active = cat.id === activeCatId;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCatId(cat.id);
                      setSearch("");
                    }}
                    className={[
                      "w-full text-left rounded-xl transition border active:scale-[0.99]",
                      compactMode ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
                      active
                        ? "bg-red-500/15 border-red-500/40"
                        : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10",
                    ].join(" ")}
                    type="button"
                  >
                    <div className="font-medium">{cat.name}</div>
                    {cat.id !== ALL_CAT_ID && (
                      <div className="text-[11px] text-white/60">{(cat.items || []).length} items</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 flex flex-col">
            <div className={["border-b border-white/10 bg-black/10", compactMode ? "p-3" : "p-4"].join(" ")}>
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                  <div className={["font-semibold", compactMode ? "text-xs" : "text-sm"].join(" ")}>
                    {activeCategory?.name || "Menu"}
                  </div>
                  <div className="text-xs text-white/60">Tap an item to add to cart</div>
                </div>

                <div className={compactMode ? "w-full md:w-64" : "w-full md:w-80"}>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search items..."
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-red-500/60"
                  />
                </div>
              </div>
              {settings?.posShowCategoryShortcuts !== false && categoryShortcuts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {categoryShortcuts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setActiveCatId(c.id);
                        setSearch("");
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                      type="button"
                    >
                      {c.name}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setActiveCatId(ALL_CAT_ID);
                      setSearch("");
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                    type="button"
                  >
                    All Items
                  </button>
                </div>
              )}
            </div>

            <div className={["overflow-y-auto overscroll-contain touch-pan-y space-y-4", compactMode ? "p-3" : "p-4"].join(" ")}>
              {/* Favorites + Recent (no horizontal scroll) */}
              {((settings?.posShowFavorites !== false && favoriteItems.length > 0) ||
                (settings?.posShowRecent !== false && recent.length > 0)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {settings?.posShowFavorites !== false && (
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
                  )}

                  {settings?.posShowRecent !== false && (
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
                  )}
                </div>
              )}

              {/* Category items */}
              {visibleItems.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/60">
                  No items found.
                </div>
              ) : (
                <div
                  className={[
                    settings?.posMenuCardSize === "lg"
                      ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                      : settings?.posMenuCardSize === "sm"
                      ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                      : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
                    compactMode ? "gap-2" : "gap-3",
                  ].join(" ")}
                >
                  {visibleItems.map((item) => {
                    const isFav = favorites.includes(item.id);
                    const inCart = cart.find(
                      (c) => c.id === item.id && c.guest === currentGuest && !c.note
                    );
                    const showItemImage = settings?.menuShowItemImages && item.imageUrl;
                    const itemImageSrc = showItemImage ? resolveMediaUrl(item.imageUrl) : "";

                    return (
                      <div
                        key={item.id}
                        className={[
                          "group rounded-2xl border border-white/10 bg-black/20 hover:border-red-500/30 hover:bg-red-500/10 transition",
                          compactMode ? "p-2.5" : "p-3",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => addToCart(item)}
                            className="flex-1 text-left active:scale-[0.99] transition"
                            type="button"
                          >
                            {showItemImage && (
                              <div className="mb-2 w-full overflow-hidden rounded-xl border border-white/10 bg-white/5">
                                <div className="relative w-full aspect-[4/3]">
                                  <img
                                    src={itemImageSrc}
                                    alt={item.name}
                                    className="w-full h-full object-contain bg-black/30"
                                  />
                                </div>
                              </div>
                            )}
                            <div className="font-semibold text-sm leading-5 line-clamp-2">
                              {item.name}
                            </div>
                            <div className="mt-1 text-xs text-white/70">
                              £{Number(item.basePrice || 0).toFixed(2)}
                            </div>
                          </button>
                          {inCart && (
                            <button
                              onClick={() => removeOneFromCart(item)}
                              className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm"
                              type="button"
                              title="Remove one"
                            >
                              -
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => toggleFav(item.id)}
                          className={[
                            "mt-2 w-full rounded-xl border px-2 text-xs font-semibold transition active:scale-[0.98]",
                            compactMode ? "py-1" : "py-1.5",
                            isFav
                              ? "border-red-500/50 bg-red-500/15 text-white"
                              : "border-white/10 bg-white/5 hover:bg-white/10 text-white/80",
                          ].join(" ")}
                          type="button"
                        >
                          {isFav ? "★ Favorited" : "☆ Favorite"} {inCart ? `• ${inCart.qty}` : ""}
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
        {(panelLocked || showRight || cart.length > 0 || selectedOrder || addOrder) && (
          <aside className="order-2 xl:order-none col-span-12 xl:col-span-3 rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col min-w-0">
          {/* CART HEADER */}
          <div className={["border-b border-white/10 bg-black/10", compactMode ? "p-3" : "p-4"].join(" ")}>
            <div className="flex items-center justify-between">
              <div>
                <div className={["font-semibold", compactMode ? "text-xs" : "text-sm"].join(" ")}>
                  {selectedOrder ? "Checkout" : addOrder ? "Edit Order" : "Cart"}
                </div>
                <div className="text-xs text-white/60">
                  {selectedOrder ? (
                    <>
                      Order #{String(selectedOrder.id).slice(0, 6)} •{" "}
                      {selectedOrder?.table?.name
                        ? `Table: ${selectedOrder.table.name}`
                        : selectedOrder.type}
                    </>
                  ) : addOrder ? (
                    <>
                      Order #{String(addOrder.id).slice(0, 6)} •{" "}
                      {addOrder?.table?.name
                        ? `Table: ${addOrder.table.name}`
                        : addOrder.type}
                    </>
                  ) : (
                    <>{headerOrderLabel}</>
                  )}
                </div>
              </div>

              {!selectedOrder && !addOrder ? (
                <button
                  onClick={clearCart}
                  className={[
                    "rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition text-xs font-semibold",
                    compactMode ? "px-2.5 py-1.5" : "px-3 py-2",
                  ].join(" ")}
                  type="button"
                >
                  Clear
                </button>
              ) : (
                <button
                  onClick={async () => {
                    if (selectedOrder) {
                      if (!(await confirmLeaveUnpaid())) return;
                      setSelectedOrder(null);
                    } else {
                      setAddOrder(null);
                      setCart([]);
                    }
                  }}
                  className={[
                    "rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition text-xs font-semibold",
                    compactMode ? "px-2.5 py-1.5" : "px-3 py-2",
                  ].join(" ")}
                  type="button"
                >
                  Back
                </button>
              )}
            </div>
          </div>

          {/* BODY */}
          <div className={["overflow-y-auto overscroll-contain touch-pan-y flex-1", compactMode ? "p-3" : "p-4"].join(" ")}>
            {/* If checking out an existing order */}
            {selectedOrder ? (
              <div className="space-y-3">
                <div className={["rounded-2xl border border-white/10 bg-black/20 space-y-2", compactMode ? "p-3" : "p-4"].join(" ")}>
                  <Row label="Subtotal" value={`£${checkoutTotals.subtotal.toFixed(2)}`} />

                  <div className="pt-2 border-t border-white/10 space-y-1 text-xs text-white/70">
                    {showPosDiscounts ? (
                      <Row
                        label="Discount"
                        value={`-£${checkoutTotals.discountAmount.toFixed(2)}`}
                      />
                    ) : null}
                    {showPosServiceCharge ? (
                      <Row
                        label="Service"
                        value={`£${checkoutTotals.serviceCharge.toFixed(2)}`}
                      />
                    ) : null}
                    {showPosTax ? (
                      <Row label="Tax" value={`£${checkoutTotals.taxAmount.toFixed(2)}`} />
                    ) : null}
                  </div>

                  <div className="pt-2 border-t border-white/10">
                    <Row label="Total" value={`£${checkoutTotals.total.toFixed(2)}`} />
                    <Row label="Paid" value={`£${checkoutTotals.paid.toFixed(2)}`} />
                    <Row
                      label="Remaining"
                      value={`£${checkoutTotals.remaining.toFixed(2)}`}
                      valueClassName={
                        checkoutTotals.remaining <= 0.001
                          ? "text-emerald-300"
                          : "text-red-200"
                      }
                    />
                  </div>
                </div>

                {/* Payment history */}
                {settings?.posShowPaymentHistory !== false && (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Payment History</div>
                      <div className="text-xs text-white/60">
                        {getPaymentsForSelected().length} entries
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                      {getPaymentsForSelected().length === 0 ? (
                        <div className="text-xs text-white/60">No payments yet.</div>
                      ) : (
                        getPaymentsForSelected().map((p) => (
                          <div
                            key={p.id}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs flex items-center justify-between"
                          >
                            <div>
                              <div className="font-semibold">
                                {p.kind === "refund" ? "Refund" : "Payment"} • {p.method}
                              </div>
                              <div className="text-white/60">{formatTime(p.createdAt)}</div>
                            </div>
                            <div className={p.kind === "refund" ? "text-red-200" : "text-emerald-200"}>
                              {p.kind === "refund" ? "-" : ""}£{Number(p.amount || 0).toFixed(2)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => printOrderReceipt(selectedOrder)}
                  className="w-full rounded-2xl py-3 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10 active:scale-[0.98] transition"
                >
                  Print Receipt Again
                </button>

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

                  <div className="grid grid-cols-2 gap-2">
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

                  {paymentMethod === "cash" && (
                    <div className="grid grid-cols-4 gap-2">
                      {[5, 10, 20, 50].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPaymentAmount(String(v))}
                          className="rounded-2xl py-2 text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.98] transition"
                        >
                          £{v}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => addPayment()}
                    disabled={isPaying || paymentAmount === ""}
                    className="w-full rounded-2xl py-3 text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/40 active:scale-[0.98] transition"
                    type="button"
                  >
                    {isPaying ? "Adding..." : "Add Payment"}
                  </button>

                  <button
                    onClick={() => addPayment({ printAfter: true })}
                    disabled={isPaying || paymentAmount === ""}
                    className="w-full rounded-2xl py-3 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10 disabled:bg-white/10 disabled:text-white/40 active:scale-[0.98] transition"
                    type="button"
                  >
                    {isPaying ? "Adding..." : "Pay & Print Receipt"}
                  </button>
                </div>


                {/* Refunds (admin/manager only) */}
                {["admin", "manager"].includes(user?.role) && (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Refund</div>
                      <div className="text-[11px] text-red-100/80">
                        Managers/Admins only
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 space-y-2">
                      <div className="text-xs text-white/70">Find order by ID</div>
                      <div className="flex gap-2">
                        <input
                          value={refundSearch}
                          onChange={(e) => setRefundSearch(e.target.value)}
                          placeholder="Enter order ID (full or prefix)"
                          className="flex-1 rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-xs outline-none"
                        />
                        <button
                          type="button"
                          onClick={findOrderForRefund}
                          disabled={refundSearching}
                          className="rounded-2xl px-3 py-2 text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/10"
                        >
                          {refundSearching ? "Searching..." : "Find"}
                        </button>
                      </div>
                      {selectedOrder && (
                        <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                          <div className="font-semibold">
                            Order #{String(selectedOrder.id || "").slice(0, 8)}
                          </div>
                          <div className="text-white/60">
                            {selectedOrder.type === "dine_in"
                              ? `Table ${selectedOrder.table?.name || "?"}`
                              : "Takeaway"}
                            {selectedOrder.openedByUser && (
                              <> • by {selectedOrder.openedByUser.fullName || selectedOrder.openedByUser.username}</>
                            )}
                          </div>
                          <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                            {(selectedOrder.items || []).map((it) => (
                              <div key={it.id} className="flex justify-between">
                                <span>{it.quantity} × {it.menuItem?.name || "Item"}</span>
                                <span>£{Number(it.totalPrice || 0).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 text-white/70">
                            Total: £{Number(selectedOrder.total || 0).toFixed(2)} • Paid: £{checkoutTotals.paid.toFixed(2)}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <MethodButton
                        active={refundMethod === "cash"}
                        onClick={() => setRefundMethod("cash")}
                        label="Cash"
                      />
                      <MethodButton
                        active={refundMethod === "card"}
                        onClick={() => setRefundMethod("card")}
                        label="Card"
                      />
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="flex-1 rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm outline-none focus:border-red-500/60"
                        placeholder="0.00"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRefundAmount(String(checkoutTotals.paid.toFixed(2)))
                        }
                        className="rounded-2xl px-4 py-3 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10 active:scale-[0.98] transition"
                      >
                        Full
                      </button>
                    </div>

                    {settings?.refundRequireManagerPin && (
                      <input
                        type="password"
                        value={refundPin}
                        onChange={(e) => setRefundPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="Manager PIN"
                        className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm outline-none focus:border-red-500/60"
                        inputMode="numeric"
                      />
                    )}

                    <button
                      onClick={addRefund}
                      disabled={isRefunding || !refundAmount}
                      className="w-full rounded-2xl py-3 text-sm font-semibold bg-red-600/80 hover:bg-red-600 disabled:bg-white/10 disabled:text-white/40 active:scale-[0.98] transition"
                      type="button"
                    >
                      {isRefunding ? "Refunding..." : "Issue Refund"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const refunds = getPaymentsForSelected().filter((p) => p.kind === "refund");
                        const last = refunds[refunds.length - 1];
                        printRefundReceipt(last);
                      }}
                      className="w-full rounded-2xl py-3 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10 active:scale-[0.98] transition"
                      disabled={getPaymentsForSelected().filter((p) => p.kind === "refund").length === 0}
                    >
                      Print Last Refund
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // Otherwise: show cart items (building new order)
              <>
                {/* Reprint by Order ID (available even when no open order) */}
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3 space-y-2">
                  <div className="text-sm font-semibold">Reprint Receipt</div>
                  <div className="text-xs text-white/60">
                    Enter an order ID to print again (even if it’s closed).
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={printSearch}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPrintSearch(v);
                        if (!v.trim()) setPrintPreview(null);
                      }}
                      placeholder="Order ID (full or prefix)"
                      className="flex-1 rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={findOrderForPrint}
                      disabled={printSearching}
                      className="rounded-2xl px-3 py-2 text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/10"
                    >
                      {printSearching ? "Finding..." : "Find"}
                    </button>
                  </div>
                  {printPreview && (
                    <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                      <div className="font-semibold">
                        Order #{String(printPreview.id || "").slice(0, 8)}
                      </div>
                      <div className="text-white/60">
                        {printPreview.type === "dine_in"
                          ? `Table ${printPreview.table?.name || "?"}`
                          : "Takeaway"}
                        {printPreview.openedByUser && (
                          <> • by {printPreview.openedByUser.fullName || printPreview.openedByUser.username}</>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                        {(printPreview.items || []).map((it) => (
                          <div key={it.id} className="flex justify-between">
                            <span>{it.quantity} × {it.menuItem?.name || "Item"}</span>
                            <span>£{Number(it.totalPrice || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-white/70">
                        Total: £{Number(printPreview.total || 0).toFixed(2)}
                      </div>
                      <button
                        type="button"
                        onClick={() => printOrderReceipt(printPreview)}
                        className="mt-3 w-full rounded-xl py-2 text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/10"
                      >
                        Print Receipt
                      </button>
                      {user?.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => deleteOrderById(printPreview.id)}
                          className="mt-2 w-full rounded-xl py-2 text-xs font-semibold bg-red-600/80 hover:bg-red-600 border border-red-500/40"
                        >
                          Delete Order
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/60">
                    Cart is empty. Tap items from the menu.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Guest</div>
                        <div className="text-xs text-white/60">Required</div>
                      </div>
                      <div className="mt-2">
                        <select
                          value={currentGuest}
                          onChange={(e) => setCurrentGuest(Number(e.target.value))}
                          className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
                        >
                          {Array.from({ length: maxGuests }, (_, i) => i + 1).map((g) => (
                            <option key={g} value={g}>
                              Guest {g}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {["admin", "manager"].includes(user?.role) && eligiblePromos.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">Promotions</div>
                          <div className="text-xs text-white/60">Manager only</div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {eligiblePromos.map((p) => {
                            const active = selectedPromos.find((x) => x.id === p.id);
                            return (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setSelectedPromos((prev) =>
                                    active ? prev.filter((x) => x.id !== p.id) : [...prev, p]
                                  );
                                }}
                                className={[
                                  "w-full text-left rounded-xl border px-3 py-2 text-xs transition",
                                  active
                                    ? "border-red-500/50 bg-red-500/10"
                                    : "border-white/10 bg-white/5 hover:bg-white/10",
                                ].join(" ")}
                              >
                                <div className="font-semibold">
                                  {p.name} • {p.type} {p.amount}
                                </div>
                                <div className="text-white/60">
                                  {new Date(p.startsAt).toLocaleDateString()} →{" "}
                                  {new Date(p.endsAt).toLocaleDateString()}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {displayCart.map((item, index) => {
                      const base = Number(item.basePrice || 0);
                      const qty = Number(item.qty || 0);
                      const lineInfo = lineByKey?.get(item.lineKey);
                      const unitDisplay = lineInfo ? Number(lineInfo.unitPrice || 0) : base;
                      const lineTotal = lineInfo ? Number(lineInfo.totalPrice || 0) : base * qty;

                      return (
                        <div
                          key={item.lineKey || index}
                          className={[
                            "rounded-2xl border border-white/10 bg-black/20",
                            compactMode ? "p-2.5" : "p-3",
                          ].join(" ")}
                        >
                          <div className="flex justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">
                                {item.name}
                                {item.isRuleItem ? (
                                  <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                                    Auto
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-white/60">
                                Guest {Number(item.guest || 1)}
                              </div>
                              <div className="text-xs text-white/60">
                                £{Number(unitDisplay).toFixed(2)} × {item.qty} ={" "}
                                <span className="text-white">
                                  £{Number(lineTotal).toFixed(2)}
                                </span>
                              </div>
                            </div>

                            {!item.isRuleItem ? (
                              <button
                                onClick={async () => {
                                  const ok = await askConfirm({
                                    title: "Remove item",
                                    body: "Remove this item from the cart?",
                                    confirmText: "Remove",
                                  });
                                  if (!ok) return;
                                  setCart((prev) => prev.filter((_, i) => i !== index));
                                }}
                                className={[
                                  "text-xs rounded-xl bg-red-600/20 border border-red-600/30 hover:bg-red-600/30 active:scale-[0.98] transition",
                                  compactMode ? "px-2.5 py-1.5" : "px-3 py-2",
                                ].join(" ")}
                                type="button"
                              >
                                Remove
                              </button>
                            ) : (
                              <div className="text-[10px] text-white/50 self-start">Auto-added</div>
                            )}
                          </div>

                          <div className="mt-3">
                            <div className="text-xs text-white/60">Quantity</div>
                            <div className="text-sm font-semibold">{item.qty}</div>
                          </div>

                          <div className="mt-3">
                            <div className="text-xs text-white/60">Guest</div>
                            <select
                              value={Number(item.guest || 1)}
                              onChange={(e) =>
                                setCart((prev) =>
                                  prev.map((c, i) =>
                                    i === index ? { ...c, guest: Number(e.target.value) } : c
                                  )
                                )
                              }
                              disabled={item.isRuleItem}
                              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs outline-none"
                            >
                              {Array.from({ length: maxGuests }, (_, i) => i + 1).map((g) => (
                                <option key={g} value={g}>
                                  Guest {g}
                                </option>
                              ))}
                            </select>
                          </div>

                          <input
                            type="text"
                            value={item.note || ""}
                            onChange={(e) =>
                              setCart((prev) =>
                                prev.map((c, i) =>
                                  i === index ? { ...c, note: e.target.value } : c
                                )
                              )
                            }
                            placeholder="Notes (e.g., no onion)"
                            disabled={item.isRuleItem}
                            className="mt-3 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs outline-none focus:border-red-500/60"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* FOOTER */}
          <div className={["border-t border-white/10 bg-black/10 space-y-3", compactMode ? "p-3" : "p-4"].join(" ")}>
            {/* When building a new order */}
            {!selectedOrder ? (
              <>
                {addOrder ? (
                  <div className="space-y-2">
                    <button
                      disabled={isAddingItems || cart.length === 0}
                      onClick={updateOrderItems}
                      className="w-full rounded-2xl py-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/10 disabled:text-white/40 active:scale-[0.98] transition"
                      type="button"
                    >
                      {isAddingItems ? "Saving..." : "Save Changes"}
                    </button>
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                      <span className="text-white/70">Send updates to kitchen</span>
                      <input
                        type="checkbox"
                        checked={addSendToKitchen}
                        onChange={(e) => setAddSendToKitchen(e.target.checked)}
                        className="h-5 w-9 accent-red-500"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      disabled={placingOrder || cart.length === 0}
                      onClick={createOrder}
                      className="w-full rounded-2xl py-3 text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/40 active:scale-[0.98] transition"
                      type="button"
                    >
                      {placingOrder
                        ? "Creating..."
                        : user?.role === "admin" && !adminSendToKitchen
                        ? "Create Order (No kitchen)"
                        : "Create Order (Auto-sent)"}
                    </button>
                    {user?.role === "admin" && (
                      <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                        <span className="text-white/70">Send to kitchen</span>
                        <input
                          type="checkbox"
                          checked={adminSendToKitchen}
                          onChange={(e) => setAdminSendToKitchen(e.target.checked)}
                          className="h-5 w-9 accent-red-500"
                        />
                      </label>
                    )}
                  </div>
                )}

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
                    {showPosDiscounts ? (
                      <div className={discountColSpan}>
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
                    ) : null}

                    {showPosServiceCharge ? (
                      <div className={serviceColSpan}>
                        <label className="block text-[11px] text-white/60 mb-1">Service %</label>
                        <input
                          type="number"
                          value={serviceChargePercent}
                          onChange={(e) => setServiceChargePercent(Number(e.target.value))}
                          className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs outline-none focus:border-red-500/60"
                          placeholder="0"
                        />
                      </div>
                    ) : null}

                    {showPosTax ? (
                      <div className={taxColSpan}>
                        <label className="block text-[11px] text-white/60 mb-1">Tax %</label>
                        <input
                          type="number"
                          value={taxPercent}
                          onChange={(e) => setTaxPercent(Number(e.target.value))}
                          className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs outline-none focus:border-red-500/60"
                          placeholder="0"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="pt-2 border-t border-white/10 space-y-1 text-xs text-white/70">
                    {showPosDiscounts ? (
                      <Row
                        label="Discount"
                        value={`-£${checkoutTotals.discountAmount.toFixed(2)}`}
                      />
                    ) : null}
                    {showPosServiceCharge ? (
                      <Row
                        label="Service"
                        value={`£${checkoutTotals.serviceCharge.toFixed(2)}`}
                      />
                    ) : null}
                    {showPosTax ? (
                      <Row label="Tax" value={`£${checkoutTotals.taxAmount.toFixed(2)}`} />
                    ) : null}
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
        )}
      </div>
    </div>
  );
}

// -----------------------------
// Small UI helpers
// -----------------------------
function Row({ label, value, valueClassName }) {
  return (
    <div className="flex justify-between items-center">
      <div className="text-white/60">{label}</div>
      <div className={valueClassName || "text-white"}>{value}</div>
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
