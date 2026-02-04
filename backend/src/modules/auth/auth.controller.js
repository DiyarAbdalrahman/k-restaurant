// src/modules/auth/auth.controller.js
const { authService } = require("./auth.service");

class AuthController {
  async register(req, res, next) {
    try {
      const { username, password, fullName, role } = req.body;
      const result = await authService.registerUser({
        username,
        password,
        fullName,
        role,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      const result = await authService.login(username, password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  me(req, res) {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(req.user);
  }
}

const authController = new AuthController();

module.exports = { authController };
