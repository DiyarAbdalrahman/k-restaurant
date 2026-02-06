"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { resolveMediaUrl } from "@/lib/media";

const ROLE_ALLOWED = new Set(["admin", "manager"]);

export default function ManagerSettingsPage() {
  const { settings, refresh } = useSettings();
  const [user, setUser] = useState(null);

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

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  if (!user) return null;

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
