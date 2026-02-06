// src/modules/menu/menu.routes.js
const { Router } = require("express");
const { menuController } = require("./menu.controller");
const {
  authMiddleware,
  requireRole,
} = require("../../middleware/auth.middleware");
const { validateBody } = require("../../middleware/validate.middleware");
const {
  menuCategoryCreateSchema,
  menuCategoryUpdateSchema,
  menuItemCreateSchema,
  menuItemUpdateSchema,
} = require("../../validation/schemas");

const menuRouter = Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const uploadDir = path.join(__dirname, "../../../public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".png";
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) return cb(null, true);
    return cb(new Error("Only image uploads are allowed"));
  },
});

// POS / clients can read menu
menuRouter.get("/", (req, res, next) =>
  menuController.getMenu(req, res, next)
);

// Admin/manager can view inactive items
menuRouter.get(
  "/admin",
  authMiddleware,
  requireRole("admin", "manager"),
  (req, res, next) => menuController.getMenuAdmin(req, res, next)
);

// Protected for editing
menuRouter.post(
  "/upload",
  authMiddleware,
  requireRole("admin", "manager"),
  upload.single("file"),
  (req, res) => {
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  }
);
menuRouter.post(
  "/categories",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(menuCategoryCreateSchema),
  (req, res, next) => menuController.createCategory(req, res, next)
);

menuRouter.patch(
  "/categories/:id",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(menuCategoryUpdateSchema),
  (req, res, next) => menuController.updateCategory(req, res, next)
);

menuRouter.delete(
  "/categories/:id",
  authMiddleware,
  requireRole("admin", "manager"),
  (req, res, next) => menuController.deleteCategory(req, res, next)
);

menuRouter.post(
  "/items",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(menuItemCreateSchema),
  (req, res, next) => menuController.createItem(req, res, next)
);

menuRouter.patch(
  "/items/:id",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(menuItemUpdateSchema),
  (req, res, next) => menuController.updateItem(req, res, next)
);

menuRouter.delete(
  "/items/:id",
  authMiddleware,
  requireRole("admin", "manager"),
  (req, res, next) => menuController.deleteItem(req, res, next)
);

module.exports = menuRouter;
