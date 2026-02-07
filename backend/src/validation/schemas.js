const { z } = require("zod");

function numFromString(schema) {
  return z.preprocess((val) => {
    if (typeof val === "string" && val.trim() !== "") return Number(val);
    return val;
  }, schema);
}

function optionalNumFromString(schema) {
  return z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string" && val.trim() !== "") return Number(val);
    return val;
  }, schema);
}
const numberFromString = numFromString(z.number());
const positiveNumberFromString = numFromString(z.number().positive());
const positiveIntFromString = numFromString(z.number().int().positive());
const boundedGuestFromString = numFromString(z.number().int().min(1).max(20));

const orderItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: positiveIntFromString,
  guest: boundedGuestFromString,
  notes: z.string().optional().default(""),
});

const orderCreateSchema = z.object({
  type: z.enum(["dine_in", "takeaway"]),
  tableId: z.string().optional().nullable(),
  notes: z.string().optional().default(""),
  discountAmount: numberFromString.optional().default(0),
  taxAmount: numberFromString.optional().default(0),
  serviceCharge: numberFromString.optional().default(0),
  sendToKitchen: z.boolean().optional().default(true),
  promotionIds: z.array(z.string()).optional().default([]),
  items: z.array(orderItemSchema).min(1),
});

const orderStatusSchema = z.object({
  status: z.enum([
    "open",
    "sent_to_kitchen",
    "in_progress",
    "ready",
    "served",
    "paid",
    "cancelled",
  ]),
});

const orderAddItemsSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  sendToKitchen: z.boolean().optional().default(true),
});

const paymentSchema = z.object({
  amount: numFromString(z.number().min(0)),
  method: z.enum(["cash", "card"]),
  note: z.string().optional(),
});

const authLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const authRegisterSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.enum(["pos", "kitchen", "manager", "admin", "waiter"]).optional(),
});

const menuCategoryCreateSchema = z.object({
  name: z.string().min(2),
  sortOrder: numberFromString.optional().default(0),
});

const menuCategoryUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  sortOrder: numberFromString.optional(),
});

const menuItemCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  basePrice: positiveNumberFromString,
  sku: z.string().optional(),
  imageUrl: z.string().optional(),
});

const menuItemUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  basePrice: positiveNumberFromString.optional(),
  sku: z.string().optional(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional(),
});

const tableCreateSchema = z.object({
  name: z.string().min(1),
  area: z.string().optional(),
  sortOrder: optionalNumFromString(z.number().int().min(0)).optional(),
});

const tableUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  area: z.string().optional(),
  sortOrder: optionalNumFromString(z.number().int().min(0)).optional(),
  isActive: z.boolean().optional(),
});

const userCreateSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.enum(["pos", "kitchen", "manager", "admin", "waiter"]),
});

const userUpdateSchema = z.object({
  fullName: z.string().min(2).optional(),
  role: z.enum(["pos", "kitchen", "manager", "admin", "waiter"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits").optional(),
});

const pinLoginSchema = z.object({
  username: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

const settingsUpdateSchema = z.object({
  brandName: z.string().optional(),
  brandTagline: z.string().optional(),
  brandColor: z.string().optional(),
  accentColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  cardColor: z.string().optional(),
  logoUrl: z.string().optional(),
  headerImageUrl: z.string().optional(),
  receiptHeaderText: z.string().optional(),
  receiptAddress: z.string().optional(),
  receiptPhone: z.string().optional(),
  receiptShowLogo: z.boolean().optional(),
  receiptShowAddress: z.boolean().optional(),
  receiptShowPhone: z.boolean().optional(),
  receiptFooterText: z.string().optional(),
  receiptShowBrandName: z.boolean().optional(),
  receiptShowOrderId: z.boolean().optional(),
  receiptShowTableType: z.boolean().optional(),
  receiptShowTakenBy: z.boolean().optional(),
  receiptShowTime: z.boolean().optional(),
  receiptShowItems: z.boolean().optional(),
  receiptShowItemNotes: z.boolean().optional(),
  receiptShowTotals: z.boolean().optional(),
  receiptShowDiscounts: z.boolean().optional(),
  receiptShowBalance: z.boolean().optional(),
  receiptShowPaymentMethod: z.boolean().optional(),
  receiptShowFooter: z.boolean().optional(),
  receiptPaperSize: z.string().optional(),
  defaultTaxPercent: optionalNumFromString(z.number().min(0).max(100)).optional(),
  defaultServiceChargePercent: optionalNumFromString(z.number().min(0).max(100)).optional(),
  paymentDefaultMethod: z.string().optional(),
  paymentAllowOverpay: z.boolean().optional(),
  paymentAllowZero: z.boolean().optional(),
  refundRequireManagerPin: z.boolean().optional(),
  refundMaxAmount: optionalNumFromString(z.number().min(0)).optional(),
  posCompactDefault: z.boolean().optional(),
  posShowPanelDefault: z.boolean().optional(),
  posAutoShowPanel: z.boolean().optional(),
  posPanelAlwaysVisible: z.boolean().optional(),
  posDefaultOrderType: z.string().optional(),
  posRequireTableSelection: z.boolean().optional(),
  posAutoOpenCheckout: z.boolean().optional(),
  posHideReadyMinutes: optionalNumFromString(z.number().int().min(1).max(120)).optional(),
  menuShowItemImages: z.boolean().optional(),
  posShowPaymentHistory: z.boolean().optional(),
  posAutoPrintReceiptOnPayment: z.boolean().optional(),
  posShowHeaderImage: z.boolean().optional(),
  posShowFavorites: z.boolean().optional(),
  posShowRecent: z.boolean().optional(),
  posShowCategoryShortcuts: z.boolean().optional(),
  posShowDiscounts: z.boolean().optional(),
  posMenuCardSize: z.string().optional(),
  kitchenSoundEnabled: z.boolean().optional(),
  kitchenLoudSound: z.boolean().optional(),
  kitchenAutoHideReadyMinutes: optionalNumFromString(z.number().int().min(1).max(120)).optional(),
  kitchenAutoPrint: z.boolean().optional(),
  kitchenAutoRefreshSeconds: optionalNumFromString(z.number().int().min(10).max(600)).optional(),
  kitchenShowAgeBands: z.boolean().optional(),
  securityInactivityLogoutMinutes: optionalNumFromString(z.number().int().min(0).max(240)).optional(),
  securityInactivityLockMinutes: optionalNumFromString(z.number().int().min(0).max(240)).optional(),
  securityAllowUserSwitching: z.boolean().optional(),
  rules: z.any().optional(),
});

const promotionSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["percent", "fixed"]),
  amount: numFromString(z.number().min(0)),
  startsAt: z.string(),
  endsAt: z.string(),
  isActive: z.boolean().optional().default(true),
  categoryIds: z.array(z.string()).optional().default([]),
  itemIds: z.array(z.string()).optional().default([]),
});

module.exports = {
  orderCreateSchema,
  orderStatusSchema,
  orderAddItemsSchema,
  paymentSchema,
  authLoginSchema,
  authRegisterSchema,
  menuCategoryCreateSchema,
  menuCategoryUpdateSchema,
  menuItemCreateSchema,
  menuItemUpdateSchema,
  tableCreateSchema,
  tableUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
  pinLoginSchema,
  settingsUpdateSchema,
  promotionSchema,
};
