const express = require("express");
const router = express.Router();
const usersController = require("./users.controller");

// GET /api/users
router.get("/", usersController.getAllUsers);

module.exports = router;
