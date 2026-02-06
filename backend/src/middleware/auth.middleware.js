// src/middleware/auth.middleware.js
const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const prisma = require("../db/prisma");

// Attaches decoded user to req.user if valid
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, username: true, role: true, fullName: true, isActive: true, pinHash: true },
    });
    if (!user || !user.isActive) {
      return res.status(403).json({ message: "Account disabled" });
    }
    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// Role-based guard
function requireRole() {
  const roles = Array.from(arguments);
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
