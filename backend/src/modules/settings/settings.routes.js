const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { authMiddleware, requireRole } = require("../../middleware/auth.middleware");
const { validateBody } = require("../../middleware/validate.middleware");
const { settingsUpdateSchema } = require("../../validation/schemas");
const settingsController = require("./settings.controller");

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

router.get("/", authMiddleware, settingsController.get);

router.put(
  "/",
  authMiddleware,
  requireRole("admin", "manager"),
  validateBody(settingsUpdateSchema),
  settingsController.update
);

router.post(
  "/upload",
  authMiddleware,
  requireRole("admin", "manager"),
  upload.single("file"),
  (req, res) => {
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  }
);

module.exports = router;
