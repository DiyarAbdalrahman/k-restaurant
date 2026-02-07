"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { resolveMediaUrl } from "@/lib/media";

const ROLE_ALLOWED = new Set(["admin", "manager"]);

export default function ManagerSettingsPage() {
  const { settings, refresh } = useSettings();
  const [user, setUser] = useState(null);
  const [menuData, setMenuData] = useState([]);
  const [tablesData, setTablesData] = useState([]);

  const inputBase =
    "w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/30 transition";
  const inputSmall =
    "w-24 rounded-xl bg-black/40 border border-white/10 px-2 py-1 text-xs outline-none focus:border-red-500/60";
  const sectionCard =
    "rounded-3xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 p-5 md:p-6 shadow-[0_10px_40px_rgba(0,0,0,0.25)]";
  const sectionTitle = "text-base font-semibold";
  const sectionHint = "text-xs text-white/50 mt-1";
  const labelText = "text-xs text-slate-300";
  const toggleWrap =
    "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2";
  const toggleLabel = "text-xs text-white/70";
  const toggleInput =
    "h-5 w-9 appearance-none rounded-full bg-white/10 checked:bg-red-500/80 relative transition before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition checked:before:translate-x-4";

  const [form, setForm] = useState({
    brandColor: "#e11d48",
    accentColor: "#f43f5e",
    backgroundColor: "#000000",
    cardColor: "#0b0b0b",
    brandName: "Kurda Restaurant",
    brandTagline: "",
    logoUrl: "/logo.png",
    headerImageUrl: "",
    receiptFooterText: "Thank you!",
    receiptHeaderText: "",
    receiptAddress: "",
    receiptPhone: "",
    receiptShowLogo: true,
    receiptShowAddress: false,
    receiptShowPhone: false,
    receiptShowBrandName: true,
    receiptShowOrderId: true,
    receiptShowTableType: true,
    receiptShowTakenBy: true,
    receiptShowTime: true,
    receiptShowItems: true,
    receiptShowItemNotes: true,
    receiptShowTotals: true,
    receiptShowDiscounts: true,
    receiptShowBalance: true,
    receiptShowPaymentMethod: true,
    receiptShowFooter: true,
    receiptPaperSize: "80mm",
    defaultTaxPercent: 0,
    defaultServiceChargePercent: 0,
    menuShowItemImages: false,
    posShowPaymentHistory: true,
    posAutoPrintReceiptOnPayment: false,
    posShowHeaderImage: false,
    posShowFavorites: true,
    posShowRecent: true,
    posShowCategoryShortcuts: true,
    posShowDiscounts: true,
    posMenuCardSize: "md",
    paymentDefaultMethod: "cash",
    paymentAllowOverpay: false,
    paymentAllowZero: true,
    refundRequireManagerPin: false,
    refundMaxAmount: 0,
    posCompactDefault: false,
    posShowPanelDefault: false,
    posAutoShowPanel: true,
    posPanelAlwaysVisible: false,
    posDefaultOrderType: "dine_in",
    posRequireTableSelection: false,
    posAutoOpenCheckout: true,
    posHideReadyMinutes: 10,
    kitchenSoundEnabled: true,
    kitchenLoudSound: false,
    kitchenAutoHideReadyMinutes: 10,
    kitchenAutoPrint: true,
    kitchenAutoRefreshSeconds: 45,
    kitchenShowAgeBands: true,
    securityInactivityLogoutMinutes: 0,
    securityInactivityLockMinutes: 0,
    securityAllowUserSwitching: true,
    rules: [],
  });
  const [message, setMessage] = useState("");
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
    if (!settings) return;
    setForm((prev) => ({ ...prev, ...settings }));
  }, [settings]);

  useEffect(() => {
    let active = true;
    async function loadOptions() {
      try {
        const [menuRes, tablesRes] = await Promise.all([
          api.get("/menu"),
          api.get("/tables"),
        ]);
        if (!active) return;
        setMenuData(menuRes.data || []);
        setTablesData(tablesRes.data || []);
      } catch {}
    }
    loadOptions();
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    try {
      setMessage("");
      const cleaned = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === null ? undefined : v])
      );
      await api.put("/settings", cleaned);
      await refresh();
      setMessage("Settings saved");
    } catch (e) {
      const data = e?.response?.data;
      if (data?.issues && Array.isArray(data.issues) && data.issues.length > 0) {
        const first = data.issues[0];
        setMessage(`Validation failed: ${first.path || "field"} - ${first.message}`);
      } else {
        const msg = data?.message || "Failed to save settings";
        setMessage(msg);
      }
    }
  }

  async function uploadImage(file, field) {
    if (!file) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/settings/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((prev) => ({ ...prev, [field]: res.data.url }));
      setMessage("Image uploaded");
    } catch (e) {
      const msg = e?.response?.data?.message || "Upload failed";
      setMessage(msg);
    } finally {
      setUploading(false);
    }
  }

  const menuCategories = useMemo(() => {
    return (menuData || []).map((c) => ({ id: c.id, name: c.name }));
  }, [menuData]);

  const menuItems = useMemo(() => {
    const items = [];
    (menuData || []).forEach((c) => {
      (c.items || []).forEach((it) => {
        items.push({ id: it.id, name: it.name, categoryId: c.id });
      });
    });
    return items;
  }, [menuData]);

  const roleOptions = ["pos", "kitchen", "manager", "admin", "waiter"];
  const dayOptions = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
  ];

  function updateRule(index, patch) {
    setForm((prev) => {
      const rules = Array.isArray(prev.rules) ? [...prev.rules] : [];
      rules[index] = { ...rules[index], ...patch };
      return { ...prev, rules };
    });
  }

  function addRule() {
    const base = {
      id: `rule-${Date.now()}`,
      name: "New Rule",
      enabled: true,
      priority: 100,
      applyMode: "stack",
      conditions: {
        match: "all",
        items: [],
        orderTypes: [],
        roles: [],
        days: [],
        time: { start: "10:00", end: "22:00" },
        tables: [],
      },
      actions: {
        freeItems: [],
        discounts: [],
        addItems: [],
        print: {
          receipt: {},
          kitchen: { groupByGuest: true, guestSeparator: true, itemLabelOverrides: [] },
        },
      },
    };
    setForm((prev) => ({ ...prev, rules: [...(prev.rules || []), base] }));
  }

  function removeRule(index) {
    setForm((prev) => ({
      ...prev,
      rules: (prev.rules || []).filter((_, i) => i !== index),
    }));
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  if (!user) return null;
  const rules = Array.isArray(form.rules) ? form.rules : [];

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
        <div className="px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={resolveMediaUrl(form.logoUrl) || "/logo.png"} alt="Kurda Restaurant" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-lg font-bold">System Settings</div>
              <div className="text-[11px] text-slate-400">
                {user.fullName} • {user.role}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/manager/reports"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Reports
            </a>
            <a
              href="/manager/orders"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Orders
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
              href="/manager/promotions"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Promotions
            </a>
            <a
              href="/manager/settings"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Settings
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

      <div className="px-4 md:px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Customize your system</div>
              <div className="text-xs text-white/60">
                Manage branding, POS defaults, kitchen behavior, and receipt layout.
              </div>
            </div>
            <button
              onClick={save}
              className="rounded-2xl px-5 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-500"
            >
              Save Changes
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 space-y-5">
              <div className={sectionCard}>
                <div className={sectionTitle}>Branding</div>
                <div className={sectionHint}>Logo, colors, and header visuals.</div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <label className={labelText}>
                    Brand color
                    <input
                      type="color"
                      value={form.brandColor || "#e11d48"}
                      onChange={(e) => setForm({ ...form, brandColor: e.target.value })}
                      className="mt-1 w-full h-10 rounded-xl bg-black/40 border border-white/10"
                    />
                  </label>
                  <label className={labelText}>
                    Accent color
                    <input
                      type="color"
                      value={form.accentColor || "#f43f5e"}
                      onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                      className="mt-1 w-full h-10 rounded-xl bg-black/40 border border-white/10"
                    />
                  </label>
                  <label className={labelText}>
                    Background
                    <input
                      type="color"
                      value={form.backgroundColor || "#000000"}
                      onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })}
                      className="mt-1 w-full h-10 rounded-xl bg-black/40 border border-white/10"
                    />
                  </label>
                  <label className={labelText}>
                    Card color
                    <input
                      type="color"
                      value={form.cardColor || "#0b0b0b"}
                      onChange={(e) => setForm({ ...form, cardColor: e.target.value })}
                      className="mt-1 w-full h-10 rounded-xl bg-black/40 border border-white/10"
                    />
                  </label>
                </div>
                <div className="mt-4 space-y-3">
                  <input
                    value={form.brandName || ""}
                    onChange={(e) => setForm({ ...form, brandName: e.target.value })}
                    placeholder="Brand name"
                    className={inputBase}
                  />
                  <input
                    value={form.brandTagline || ""}
                    onChange={(e) => setForm({ ...form, brandTagline: e.target.value })}
                    placeholder="Tagline (optional)"
                    className={inputBase}
                  />
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-white/70 mb-2">Logo</div>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl bg-white/10 border border-white/10 overflow-hidden">
                        <img
                          src={resolveMediaUrl(form.logoUrl) || "/logo.png"}
                          alt="Logo preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => uploadImage(e.target.files?.[0], "logoUrl")}
                        className="text-xs text-white/70"
                        disabled={uploading}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-white/70 mb-2">Header image (optional)</div>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl bg-white/10 border border-white/10 overflow-hidden">
                        <img
                          src={resolveMediaUrl(form.headerImageUrl) || "/logo.png"}
                          alt="Header preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => uploadImage(e.target.files?.[0], "headerImageUrl")}
                        className="text-xs text-white/70"
                        disabled={uploading}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-5">
              <div className={sectionCard}>
                <div className={sectionTitle}>POS Defaults</div>
                <div className={sectionHint}>Set the default behavior for checkout and layout.</div>
                <div className="grid grid-cols-1 gap-2 mt-4">
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show menu item images</span>
                    <input
                      type="checkbox"
                      checked={form.menuShowItemImages}
                      onChange={(e) =>
                        setForm({ ...form, menuShowItemImages: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show payment history panel</span>
                    <input
                      type="checkbox"
                      checked={form.posShowPaymentHistory}
                      onChange={(e) =>
                        setForm({ ...form, posShowPaymentHistory: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Auto-print receipt when paid</span>
                    <input
                      type="checkbox"
                      checked={form.posAutoPrintReceiptOnPayment}
                      onChange={(e) =>
                        setForm({ ...form, posAutoPrintReceiptOnPayment: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Compact mode default</span>
                    <input
                      type="checkbox"
                      checked={form.posCompactDefault}
                      onChange={(e) => setForm({ ...form, posCompactDefault: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show right panel by default</span>
                    <input
                      type="checkbox"
                      checked={form.posShowPanelDefault}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          posShowPanelDefault: e.target.checked,
                          posAutoShowPanel: e.target.checked ? true : form.posAutoShowPanel,
                        })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Auto-show panel on item add</span>
                    <input
                      type="checkbox"
                      checked={form.posAutoShowPanel}
                      onChange={(e) => setForm({ ...form, posAutoShowPanel: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Keep panel always visible</span>
                    <input
                      type="checkbox"
                      checked={form.posPanelAlwaysVisible}
                      onChange={(e) =>
                        setForm({ ...form, posPanelAlwaysVisible: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Require table selection (dine-in)</span>
                    <input
                      type="checkbox"
                      checked={form.posRequireTableSelection}
                      onChange={(e) =>
                        setForm({ ...form, posRequireTableSelection: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Auto-open checkout when order selected</span>
                    <input
                      type="checkbox"
                      checked={form.posAutoOpenCheckout}
                      onChange={(e) =>
                        setForm({ ...form, posAutoOpenCheckout: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show header image in POS</span>
                    <input
                      type="checkbox"
                      checked={form.posShowHeaderImage}
                      onChange={(e) =>
                        setForm({ ...form, posShowHeaderImage: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show favorites section</span>
                    <input
                      type="checkbox"
                      checked={form.posShowFavorites}
                      onChange={(e) =>
                        setForm({ ...form, posShowFavorites: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show recent section</span>
                    <input
                      type="checkbox"
                      checked={form.posShowRecent}
                      onChange={(e) =>
                        setForm({ ...form, posShowRecent: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show category shortcuts</span>
                    <input
                      type="checkbox"
                      checked={form.posShowCategoryShortcuts}
                      onChange={(e) =>
                        setForm({ ...form, posShowCategoryShortcuts: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show discount controls in POS</span>
                    <input
                      type="checkbox"
                      checked={form.posShowDiscounts}
                      onChange={(e) =>
                        setForm({ ...form, posShowDiscounts: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className={labelText}>
                    Menu card size
                    <select
                      value={form.posMenuCardSize || "md"}
                      onChange={(e) => setForm({ ...form, posMenuCardSize: e.target.value })}
                      className={`${inputBase} mt-1`}
                    >
                      <option value="sm">Compact</option>
                      <option value="md">Standard</option>
                      <option value="lg">Large</option>
                    </select>
                  </label>
                  <label className={labelText}>
                    Default order type
                    <select
                      value={form.posDefaultOrderType || "dine_in"}
                      onChange={(e) =>
                        setForm({ ...form, posDefaultOrderType: e.target.value })
                      }
                      className={`${inputBase} mt-1`}
                    >
                      <option value="dine_in">Dine In</option>
                      <option value="takeaway">Takeaway</option>
                    </select>
                  </label>
                  <label className={labelText}>
                    Hide Ready (minutes)
                    <input
                      type="number"
                      value={form.posHideReadyMinutes || 10}
                      onChange={(e) => setForm({ ...form, posHideReadyMinutes: Number(e.target.value) })}
                      className={`${inputSmall} mt-1`}
                    />
                  </label>
                  <label className={labelText}>
                    Default Tax %
                    <input
                      type="number"
                      value={form.defaultTaxPercent || 0}
                      onChange={(e) => setForm({ ...form, defaultTaxPercent: Number(e.target.value) })}
                      className={`${inputSmall} mt-1`}
                    />
                  </label>
                  <label className={labelText}>
                    Default Service %
                    <input
                      type="number"
                      value={form.defaultServiceChargePercent || 0}
                      onChange={(e) =>
                        setForm({ ...form, defaultServiceChargePercent: Number(e.target.value) })
                      }
                      className={`${inputSmall} mt-1`}
                    />
                  </label>
                </div>
              </div>

              <div className={sectionCard}>
                <div className={sectionTitle}>Payments & Refunds</div>
                <div className={sectionHint}>Payment defaults and refund safeguards.</div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <label className={labelText}>
                    Default payment method
                    <select
                      value={form.paymentDefaultMethod || "cash"}
                      onChange={(e) =>
                        setForm({ ...form, paymentDefaultMethod: e.target.value })
                      }
                      className={`${inputBase} mt-1`}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                    </select>
                  </label>
                  <label className={labelText}>
                    Max refund per order (0 = no limit)
                    <input
                      type="number"
                      value={form.refundMaxAmount || 0}
                      onChange={(e) =>
                        setForm({ ...form, refundMaxAmount: Number(e.target.value) })
                      }
                      className={`${inputSmall} mt-1`}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-4">
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Allow overpayment</span>
                    <input
                      type="checkbox"
                      checked={form.paymentAllowOverpay}
                      onChange={(e) =>
                        setForm({ ...form, paymentAllowOverpay: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Allow zero-amount payment</span>
                    <input
                      type="checkbox"
                      checked={form.paymentAllowZero}
                      onChange={(e) =>
                        setForm({ ...form, paymentAllowZero: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Require manager PIN for refunds</span>
                    <input
                      type="checkbox"
                      checked={form.refundRequireManagerPin}
                      onChange={(e) =>
                        setForm({ ...form, refundRequireManagerPin: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                </div>
              </div>

              <div className={sectionCard}>
                <div className={sectionTitle}>Kitchen Defaults</div>
                <div className={sectionHint}>Sound and timing behavior for kitchen screen.</div>
                <div className="grid grid-cols-1 gap-2 mt-4">
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Sound enabled</span>
                    <input
                      type="checkbox"
                      checked={form.kitchenSoundEnabled}
                      onChange={(e) => setForm({ ...form, kitchenSoundEnabled: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Loud sound</span>
                    <input
                      type="checkbox"
                      checked={form.kitchenLoudSound}
                      onChange={(e) => setForm({ ...form, kitchenLoudSound: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Auto-print new orders</span>
                    <input
                      type="checkbox"
                      checked={form.kitchenAutoPrint}
                      onChange={(e) => setForm({ ...form, kitchenAutoPrint: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show order age bands</span>
                    <input
                      type="checkbox"
                      checked={form.kitchenShowAgeBands}
                      onChange={(e) => setForm({ ...form, kitchenShowAgeBands: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={labelText}>
                    Auto-hide Ready (minutes)
                    <input
                      type="number"
                      value={form.kitchenAutoHideReadyMinutes || 10}
                      onChange={(e) =>
                        setForm({ ...form, kitchenAutoHideReadyMinutes: Number(e.target.value) })
                      }
                      className={`${inputSmall} mt-1`}
                    />
                  </label>
                  <label className={labelText}>
                    Auto-refresh (seconds)
                    <input
                      type="number"
                      value={form.kitchenAutoRefreshSeconds || 45}
                      onChange={(e) =>
                        setForm({ ...form, kitchenAutoRefreshSeconds: Number(e.target.value) })
                      }
                      className={`${inputSmall} mt-1`}
                    />
                  </label>
                </div>
              </div>

              <div className={sectionCard}>
                <div className={sectionTitle}>Receipts</div>
                <div className={sectionHint}>Choose what appears on printed receipts.</div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <input
                    value={form.receiptHeaderText || ""}
                    onChange={(e) => setForm({ ...form, receiptHeaderText: e.target.value })}
                    placeholder="Header text (optional)"
                    className={inputBase}
                  />
                  <input
                    value={form.receiptFooterText || ""}
                    onChange={(e) => setForm({ ...form, receiptFooterText: e.target.value })}
                    placeholder="Footer text"
                    className={inputBase}
                  />
                  <input
                    value={form.receiptAddress || ""}
                    onChange={(e) => setForm({ ...form, receiptAddress: e.target.value })}
                    placeholder="Address (optional)"
                    className={inputBase}
                  />
                  <input
                    value={form.receiptPhone || ""}
                    onChange={(e) => setForm({ ...form, receiptPhone: e.target.value })}
                    placeholder="Phone (optional)"
                    className={inputBase}
                  />
                  <label className={labelText}>
                    Paper size
                    <select
                      value={form.receiptPaperSize || "80mm"}
                      onChange={(e) =>
                        setForm({ ...form, receiptPaperSize: e.target.value })
                      }
                      className={`${inputBase} mt-1`}
                    >
                      <option value="58mm">58mm</option>
                      <option value="80mm">80mm</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/70">
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show logo</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowLogo}
                      onChange={(e) => setForm({ ...form, receiptShowLogo: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show brand name</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowBrandName}
                      onChange={(e) => setForm({ ...form, receiptShowBrandName: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show address</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowAddress}
                      onChange={(e) => setForm({ ...form, receiptShowAddress: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show phone</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowPhone}
                      onChange={(e) => setForm({ ...form, receiptShowPhone: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show order ID</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowOrderId}
                      onChange={(e) => setForm({ ...form, receiptShowOrderId: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show table/takeaway</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowTableType}
                      onChange={(e) => setForm({ ...form, receiptShowTableType: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show taken by</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowTakenBy}
                      onChange={(e) => setForm({ ...form, receiptShowTakenBy: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show time</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowTime}
                      onChange={(e) => setForm({ ...form, receiptShowTime: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show items</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowItems}
                      onChange={(e) => setForm({ ...form, receiptShowItems: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show item notes</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowItemNotes}
                      onChange={(e) =>
                        setForm({ ...form, receiptShowItemNotes: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show totals</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowTotals}
                      onChange={(e) => setForm({ ...form, receiptShowTotals: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show discounts</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowDiscounts}
                      onChange={(e) =>
                        setForm({ ...form, receiptShowDiscounts: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show balance</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowBalance}
                      onChange={(e) =>
                        setForm({ ...form, receiptShowBalance: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show payment method</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowPaymentMethod}
                      onChange={(e) => setForm({ ...form, receiptShowPaymentMethod: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Show footer</span>
                    <input
                      type="checkbox"
                      checked={form.receiptShowFooter}
                      onChange={(e) => setForm({ ...form, receiptShowFooter: e.target.checked })}
                      className={toggleInput}
                    />
                  </label>
                </div>
              </div>

              <div className={sectionCard}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className={sectionTitle}>Rules</div>
                    <div className={sectionHint}>
                      Create flexible pricing and printing rules.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addRule}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 border border-white/10 hover:bg-white/15"
                  >
                    Add Rule
                  </button>
                </div>

                {rules.length === 0 ? (
                  <div className="mt-4 text-xs text-white/60">
                    No rules yet. Click “Add Rule” to create one.
                  </div>
                ) : null}

                <div className="mt-4 space-y-4">
                  {rules.map((rule, ruleIndex) => (
                    <div
                      key={rule.id || ruleIndex}
                      className="rounded-2xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <label className={`${labelText} flex-1 min-w-[180px]`}>
                          Rule name
                          <input
                            value={rule.name || ""}
                            onChange={(e) => updateRule(ruleIndex, { name: e.target.value })}
                            className={`${inputBase} mt-1`}
                          />
                        </label>
                        <label className={`${labelText} w-28`}>
                          Priority
                          <input
                            type="number"
                            value={Number(rule.priority || 100)}
                            onChange={(e) =>
                              updateRule(ruleIndex, { priority: Number(e.target.value) })
                            }
                            className={`${inputSmall} mt-1 w-full`}
                          />
                        </label>
                        <label className={`${labelText} w-36`}>
                          Apply mode
                          <select
                            value={rule.applyMode || "stack"}
                            onChange={(e) => updateRule(ruleIndex, { applyMode: e.target.value })}
                            className={`${inputSmall} mt-1 w-full`}
                          >
                            <option value="stack">Stack</option>
                            <option value="first">First match</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-white/70">
                          <input
                            type="checkbox"
                            checked={rule.enabled !== false}
                            onChange={(e) => updateRule(ruleIndex, { enabled: e.target.checked })}
                            className={toggleInput}
                          />
                          Enabled
                        </label>
                        <button
                          type="button"
                          onClick={() => removeRule(ruleIndex)}
                          className="ml-auto px-2.5 py-2 rounded-xl text-xs font-semibold bg-red-600/30 border border-red-600/40 hover:bg-red-600/40"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="text-xs text-white/60 uppercase">Conditions</div>
                          <div className="mt-2">
                            <label className={labelText}>
                              Match
                              <select
                                value={rule.conditions?.match || "all"}
                                onChange={(e) =>
                                  updateRule(ruleIndex, {
                                    conditions: { ...rule.conditions, match: e.target.value },
                                  })
                                }
                                className={`${inputSmall} mt-1 w-full`}
                              >
                                <option value="all">All</option>
                                <option value="any">Any</option>
                              </select>
                            </label>
                          </div>

                          <div className="mt-3">
                            <div className="text-xs text-white/60">Items / Categories</div>
                            {(rule.conditions?.items || []).map((cond, condIndex) => (
                              <div key={condIndex} className="mt-2 grid grid-cols-12 gap-2">
                                <select
                                  value={cond.kind || "item"}
                                  onChange={(e) => {
                                    const next = [...(rule.conditions?.items || [])];
                                    next[condIndex] = { ...next[condIndex], kind: e.target.value };
                                    updateRule(ruleIndex, {
                                      conditions: { ...rule.conditions, items: next },
                                    });
                                  }}
                                  className="col-span-3 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                >
                                  <option value="item">Item</option>
                                  <option value="category">Category</option>
                                </select>
                                <select
                                  value={cond.id || ""}
                                  onChange={(e) => {
                                    const next = [...(rule.conditions?.items || [])];
                                    next[condIndex] = { ...next[condIndex], id: e.target.value };
                                    updateRule(ruleIndex, {
                                      conditions: { ...rule.conditions, items: next },
                                    });
                                  }}
                                  className="col-span-6 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                >
                                  <option value="">Select</option>
                                  {(cond.kind === "category" ? menuCategories : menuItems).map(
                                    (opt) => (
                                      <option key={opt.id} value={opt.id}>
                                        {opt.name}
                                      </option>
                                    )
                                  )}
                                </select>
                                <input
                                  type="number"
                                  placeholder="Qty"
                                  value={Number(cond.minQty || 1)}
                                  onChange={(e) => {
                                    const next = [...(rule.conditions?.items || [])];
                                    next[condIndex] = {
                                      ...next[condIndex],
                                      minQty: Number(e.target.value),
                                    };
                                    updateRule(ruleIndex, {
                                      conditions: { ...rule.conditions, items: next },
                                    });
                                  }}
                                  className="col-span-2 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (rule.conditions?.items || []).filter(
                                      (_, i) => i !== condIndex
                                    );
                                    updateRule(ruleIndex, {
                                      conditions: { ...rule.conditions, items: next },
                                    });
                                  }}
                                  className="col-span-1 text-xs text-red-200"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...(rule.conditions?.items || [])];
                                next.push({ kind: "item", id: "", minQty: 1 });
                                updateRule(ruleIndex, {
                                  conditions: { ...rule.conditions, items: next },
                                });
                              }}
                              className="mt-2 text-xs text-white/70 hover:text-white"
                            >
                              + Add item condition
                            </button>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <label className={labelText}>
                              Order types
                              <div className="mt-1 flex flex-wrap gap-2">
                                {["dine_in", "takeaway"].map((t) => (
                                  <label key={t} className="text-xs text-white/70 flex items-center gap-1">
                                    <input
                                      type="checkbox"
                                      checked={(rule.conditions?.orderTypes || []).includes(t)}
                                      onChange={(e) => {
                                        const next = new Set(rule.conditions?.orderTypes || []);
                                        if (e.target.checked) next.add(t);
                                        else next.delete(t);
                                        updateRule(ruleIndex, {
                                          conditions: {
                                            ...rule.conditions,
                                            orderTypes: Array.from(next),
                                          },
                                        });
                                      }}
                                      className={toggleInput}
                                    />
                                    {t}
                                  </label>
                                ))}
                              </div>
                            </label>
                            <label className={labelText}>
                              Roles
                              <div className="mt-1 flex flex-wrap gap-2">
                                {roleOptions.map((r) => (
                                  <label key={r} className="text-xs text-white/70 flex items-center gap-1">
                                    <input
                                      type="checkbox"
                                      checked={(rule.conditions?.roles || []).includes(r)}
                                      onChange={(e) => {
                                        const next = new Set(rule.conditions?.roles || []);
                                        if (e.target.checked) next.add(r);
                                        else next.delete(r);
                                        updateRule(ruleIndex, {
                                          conditions: {
                                            ...rule.conditions,
                                            roles: Array.from(next),
                                          },
                                        });
                                      }}
                                      className={toggleInput}
                                    />
                                    {r}
                                  </label>
                                ))}
                              </div>
                            </label>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <label className={labelText}>
                              Days
                              <div className="mt-1 flex flex-wrap gap-2">
                                {dayOptions.map((d) => (
                                  <label key={d.value} className="text-xs text-white/70 flex items-center gap-1">
                                    <input
                                      type="checkbox"
                                      checked={(rule.conditions?.days || []).includes(d.value)}
                                      onChange={(e) => {
                                        const next = new Set(rule.conditions?.days || []);
                                        if (e.target.checked) next.add(d.value);
                                        else next.delete(d.value);
                                        updateRule(ruleIndex, {
                                          conditions: {
                                            ...rule.conditions,
                                            days: Array.from(next),
                                          },
                                        });
                                      }}
                                      className={toggleInput}
                                    />
                                    {d.label}
                                  </label>
                                ))}
                              </div>
                            </label>
                            <label className={labelText}>
                              Time range
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  type="time"
                                  value={rule.conditions?.time?.start || "10:00"}
                                  onChange={(e) =>
                                    updateRule(ruleIndex, {
                                      conditions: {
                                        ...rule.conditions,
                                        time: { ...rule.conditions?.time, start: e.target.value },
                                      },
                                    })
                                  }
                                  className={inputSmall}
                                />
                                <span className="text-xs text-white/50">to</span>
                                <input
                                  type="time"
                                  value={rule.conditions?.time?.end || "22:00"}
                                  onChange={(e) =>
                                    updateRule(ruleIndex, {
                                      conditions: {
                                        ...rule.conditions,
                                        time: { ...rule.conditions?.time, end: e.target.value },
                                      },
                                    })
                                  }
                                  className={inputSmall}
                                />
                              </div>
                            </label>
                          </div>

                          <div className="mt-3">
                            <div className="text-xs text-white/60">Tables</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {(tablesData || []).map((t) => (
                                <label key={t.id} className="text-xs text-white/70 flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={(rule.conditions?.tables || []).includes(t.id)}
                                    onChange={(e) => {
                                      const next = new Set(rule.conditions?.tables || []);
                                      if (e.target.checked) next.add(t.id);
                                      else next.delete(t.id);
                                      updateRule(ruleIndex, {
                                        conditions: {
                                          ...rule.conditions,
                                          tables: Array.from(next),
                                        },
                                      });
                                    }}
                                    className={toggleInput}
                                  />
                                  {t.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="text-xs text-white/60 uppercase">Actions</div>

                          <div className="mt-2">
                            <div className="text-xs text-white/60">Free items</div>
                            {(rule.actions?.freeItems || []).map((act, actIndex) => (
                              <div key={actIndex} className="mt-2 grid grid-cols-12 gap-2">
                                <select
                                  value={act.kind || "item"}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.freeItems || [])];
                                    next[actIndex] = { ...next[actIndex], kind: e.target.value };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, freeItems: next },
                                    });
                                  }}
                                  className="col-span-3 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                >
                                  <option value="item">Item</option>
                                  <option value="category">Category</option>
                                </select>
                                <select
                                  value={act.id || ""}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.freeItems || [])];
                                    next[actIndex] = { ...next[actIndex], id: e.target.value };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, freeItems: next },
                                    });
                                  }}
                                  className="col-span-5 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                >
                                  <option value="">Select</option>
                                  {(act.kind === "category" ? menuCategories : menuItems).map(
                                    (opt) => (
                                      <option key={opt.id} value={opt.id}>
                                        {opt.name}
                                      </option>
                                    )
                                  )}
                                </select>
                                <input
                                  type="number"
                                  placeholder="Free qty"
                                  value={Number(act.freeQty || 1)}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.freeItems || [])];
                                    next[actIndex] = {
                                      ...next[actIndex],
                                      freeQty: Number(e.target.value),
                                    };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, freeItems: next },
                                    });
                                  }}
                                  className="col-span-2 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                />
                                <label className="col-span-1 text-[10px] text-white/60 flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={act.perMatchedItem === true}
                                    onChange={(e) => {
                                      const next = [...(rule.actions?.freeItems || [])];
                                      next[actIndex] = {
                                        ...next[actIndex],
                                        perMatchedItem: e.target.checked,
                                      };
                                      updateRule(ruleIndex, {
                                        actions: { ...rule.actions, freeItems: next },
                                      });
                                    }}
                                    className={toggleInput}
                                  />
                                  per matched
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (rule.actions?.freeItems || []).filter(
                                      (_, i) => i !== actIndex
                                    );
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, freeItems: next },
                                    });
                                  }}
                                  className="col-span-1 text-xs text-red-200"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...(rule.actions?.freeItems || [])];
                                next.push({ kind: "item", id: "", freeQty: 1, perMatchedItem: false });
                                updateRule(ruleIndex, {
                                  actions: { ...rule.actions, freeItems: next },
                                });
                              }}
                              className="mt-2 text-xs text-white/70 hover:text-white"
                            >
                              + Add free item rule
                            </button>
                          </div>

                          <div className="mt-4">
                            <div className="text-xs text-white/60">Discounts</div>
                            {(rule.actions?.discounts || []).map((act, actIndex) => (
                              <div key={actIndex} className="mt-2 grid grid-cols-12 gap-2">
                                <select
                                  value={act.type || "percent"}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.discounts || [])];
                                    next[actIndex] = { ...next[actIndex], type: e.target.value };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, discounts: next },
                                    });
                                  }}
                                  className="col-span-3 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                >
                                  <option value="percent">Percent</option>
                                  <option value="fixed">Fixed</option>
                                </select>
                                <input
                                  type="number"
                                  placeholder="Amount"
                                  value={Number(act.amount || 0)}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.discounts || [])];
                                    next[actIndex] = {
                                      ...next[actIndex],
                                      amount: Number(e.target.value),
                                    };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, discounts: next },
                                    });
                                  }}
                                  className="col-span-3 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                />
                                <select
                                  value={act.scope || "order"}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.discounts || [])];
                                    next[actIndex] = { ...next[actIndex], scope: e.target.value };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, discounts: next },
                                    });
                                  }}
                                  className="col-span-3 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                >
                                  <option value="order">Order</option>
                                  <option value="category">Category</option>
                                  <option value="item">Item</option>
                                </select>
                                <select
                                  value={act.targetId || ""}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.discounts || [])];
                                    next[actIndex] = { ...next[actIndex], targetId: e.target.value };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, discounts: next },
                                    });
                                  }}
                                  className="col-span-2 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                >
                                  <option value="">Target</option>
                                  {(act.scope === "category" ? menuCategories : menuItems).map(
                                    (opt) => (
                                      <option key={opt.id} value={opt.id}>
                                        {opt.name}
                                      </option>
                                    )
                                  )}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (rule.actions?.discounts || []).filter(
                                      (_, i) => i !== actIndex
                                    );
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, discounts: next },
                                    });
                                  }}
                                  className="col-span-1 text-xs text-red-200"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...(rule.actions?.discounts || [])];
                                next.push({ type: "percent", amount: 10, scope: "order", targetId: "" });
                                updateRule(ruleIndex, {
                                  actions: { ...rule.actions, discounts: next },
                                });
                              }}
                              className="mt-2 text-xs text-white/70 hover:text-white"
                            >
                              + Add discount rule
                            </button>
                          </div>

                          <div className="mt-4">
                            <div className="text-xs text-white/60">Auto add items</div>
                            {(rule.actions?.addItems || []).map((act, actIndex) => (
                              <div key={actIndex} className="mt-2 grid grid-cols-12 gap-2">
                                <select
                                  value={act.itemId || ""}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.addItems || [])];
                                    next[actIndex] = { ...next[actIndex], itemId: e.target.value };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, addItems: next },
                                    });
                                  }}
                                  className="col-span-5 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                >
                                  <option value="">Select item</option>
                                  {menuItems.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  placeholder="Qty"
                                  value={Number(act.qty || 1)}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.addItems || [])];
                                    next[actIndex] = { ...next[actIndex], qty: Number(e.target.value) };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, addItems: next },
                                    });
                                  }}
                                  className="col-span-2 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                />
                                <input
                                  type="number"
                                  placeholder="Guest"
                                  value={Number(act.guest || 1)}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.addItems || [])];
                                    next[actIndex] = { ...next[actIndex], guest: Number(e.target.value) };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, addItems: next },
                                    });
                                  }}
                                  className="col-span-2 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                />
                                <label className="col-span-2 text-[10px] text-white/60 flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={act.free === true}
                                    onChange={(e) => {
                                      const next = [...(rule.actions?.addItems || [])];
                                      next[actIndex] = { ...next[actIndex], free: e.target.checked };
                                      updateRule(ruleIndex, {
                                        actions: { ...rule.actions, addItems: next },
                                      });
                                    }}
                                    className={toggleInput}
                                  />
                                  free
                                </label>
                                <input
                                  type="text"
                                  placeholder="Note"
                                  value={act.note || ""}
                                  onChange={(e) => {
                                    const next = [...(rule.actions?.addItems || [])];
                                    next[actIndex] = { ...next[actIndex], note: e.target.value };
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, addItems: next },
                                    });
                                  }}
                                  className="col-span-12 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (rule.actions?.addItems || []).filter(
                                      (_, i) => i !== actIndex
                                    );
                                    updateRule(ruleIndex, {
                                      actions: { ...rule.actions, addItems: next },
                                    });
                                  }}
                                  className="col-span-1 text-xs text-red-200"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...(rule.actions?.addItems || [])];
                                next.push({ itemId: "", qty: 1, guest: 1, free: false, note: "" });
                                updateRule(ruleIndex, {
                                  actions: { ...rule.actions, addItems: next },
                                });
                              }}
                              className="mt-2 text-xs text-white/70 hover:text-white"
                            >
                              + Add auto item
                            </button>
                          </div>

                          <div className="mt-4">
                            <div className="text-xs text-white/60">Kitchen print</div>
                            <div className="mt-2 flex flex-wrap gap-3">
                              <label className="text-xs text-white/70 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={rule.actions?.print?.kitchen?.groupByGuest !== false}
                                  onChange={(e) =>
                                    updateRule(ruleIndex, {
                                      actions: {
                                        ...rule.actions,
                                        print: {
                                          ...rule.actions?.print,
                                          kitchen: {
                                            ...rule.actions?.print?.kitchen,
                                            groupByGuest: e.target.checked,
                                          },
                                        },
                                      },
                                    })
                                  }
                                  className={toggleInput}
                                />
                                Group by guest
                              </label>
                              <label className="text-xs text-white/70 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={rule.actions?.print?.kitchen?.guestSeparator !== false}
                                  onChange={(e) =>
                                    updateRule(ruleIndex, {
                                      actions: {
                                        ...rule.actions,
                                        print: {
                                          ...rule.actions?.print,
                                          kitchen: {
                                            ...rule.actions?.print?.kitchen,
                                            guestSeparator: e.target.checked,
                                          },
                                        },
                                      },
                                    })
                                  }
                                  className={toggleInput}
                                />
                                Guest separator line
                              </label>
                            </div>
                            <div className="mt-2">
                              <div className="text-xs text-white/60">Item label overrides</div>
                              {(rule.actions?.print?.kitchen?.itemLabelOverrides || []).map(
                                (ovr, ovrIndex) => (
                                  <div key={ovrIndex} className="mt-2 grid grid-cols-12 gap-2">
                                    <select
                                      value={ovr.itemId || ""}
                                      onChange={(e) => {
                                        const next = [
                                          ...(rule.actions?.print?.kitchen?.itemLabelOverrides || []),
                                        ];
                                        next[ovrIndex] = { ...next[ovrIndex], itemId: e.target.value };
                                        updateRule(ruleIndex, {
                                          actions: {
                                            ...rule.actions,
                                            print: {
                                              ...rule.actions?.print,
                                              kitchen: {
                                                ...rule.actions?.print?.kitchen,
                                                itemLabelOverrides: next,
                                              },
                                            },
                                          },
                                        });
                                      }}
                                      className="col-span-5 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                    >
                                      <option value="">Select item</option>
                                      {menuItems.map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                          {opt.name}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      placeholder="Label"
                                      value={ovr.label || ""}
                                      onChange={(e) => {
                                        const next = [
                                          ...(rule.actions?.print?.kitchen?.itemLabelOverrides || []),
                                        ];
                                        next[ovrIndex] = { ...next[ovrIndex], label: e.target.value };
                                        updateRule(ruleIndex, {
                                          actions: {
                                            ...rule.actions,
                                            print: {
                                              ...rule.actions?.print,
                                              kitchen: {
                                                ...rule.actions?.print?.kitchen,
                                                itemLabelOverrides: next,
                                              },
                                            },
                                          },
                                        });
                                      }}
                                      className="col-span-6 rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = (
                                          rule.actions?.print?.kitchen?.itemLabelOverrides || []
                                        ).filter((_, i) => i !== ovrIndex);
                                        updateRule(ruleIndex, {
                                          actions: {
                                            ...rule.actions,
                                            print: {
                                              ...rule.actions?.print,
                                              kitchen: {
                                                ...rule.actions?.print?.kitchen,
                                                itemLabelOverrides: next,
                                              },
                                            },
                                          },
                                        });
                                      }}
                                      className="col-span-1 text-xs text-red-200"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                )
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [
                                    ...(rule.actions?.print?.kitchen?.itemLabelOverrides || []),
                                  ];
                                  next.push({ itemId: "", label: "" });
                                  updateRule(ruleIndex, {
                                    actions: {
                                      ...rule.actions,
                                      print: {
                                        ...rule.actions?.print,
                                        kitchen: {
                                          ...rule.actions?.print?.kitchen,
                                          itemLabelOverrides: next,
                                        },
                                      },
                                    },
                                  });
                                }}
                                className="mt-2 text-xs text-white/70 hover:text-white"
                              >
                                + Add label override
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={sectionCard}>
                <div className={sectionTitle}>Security</div>
                <div className={sectionHint}>Inactivity rules and user switching.</div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <label className={labelText}>
                    Auto logout (minutes)
                    <input
                      type="number"
                      value={form.securityInactivityLogoutMinutes || 0}
                      onChange={(e) =>
                        setForm({ ...form, securityInactivityLogoutMinutes: Number(e.target.value) })
                      }
                      className={`${inputSmall} mt-1`}
                    />
                  </label>
                  <label className={labelText}>
                    Lock screen (minutes)
                    <input
                      type="number"
                      value={form.securityInactivityLockMinutes || 0}
                      onChange={(e) =>
                        setForm({ ...form, securityInactivityLockMinutes: Number(e.target.value) })
                      }
                      className={`${inputSmall} mt-1`}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-4">
                  <label className={toggleWrap}>
                    <span className={toggleLabel}>Allow POS user switching</span>
                    <input
                      type="checkbox"
                      checked={form.securityAllowUserSwitching}
                      onChange={(e) =>
                        setForm({ ...form, securityAllowUserSwitching: e.target.checked })
                      }
                      className={toggleInput}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={save}
              className="w-full rounded-2xl py-3 text-sm font-semibold bg-red-600 hover:bg-red-500"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
