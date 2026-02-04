const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../../middleware/auth.middleware");
const { requireRole } = require("../../middleware/role.middleware");
const { reportsController } = require("./reports.controller");

router.use(authMiddleware, requireRole("manager", "admin"));

router.get("/summary", reportsController.summary);
router.get("/items", reportsController.items);

module.exports = router;
