// src/modules/auth/auth.service.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../../db/prisma");
const { env } = require("../../config/env");

const SALT_ROUNDS = 10;

class AuthService {
  async registerUser(params) {
    const hashed = await bcrypt.hash(params.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        username: params.username,
        passwordHash: hashed,
        fullName: params.fullName,
        role: params.role || "waiter",
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(username, password) {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw { status: 401, message: "Invalid credentials" };
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw { status: 401, message: "Invalid credentials" };
    }

    return this.buildAuthResponse(user);
  }

  buildAuthResponse(user) {
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: "12h",
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}

const authService = new AuthService();

module.exports = { authService };
