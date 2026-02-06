const usersService = require("./users.service");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;

async function getAllUsers(req, res, next) {
  try {
    const users = await usersService.getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { username, password, fullName, role } = req.body;

    // Managers cannot create admin users
    if (req.user.role !== "admin" && role === "admin") {
      return res.status(403).json({ message: "Only admin can create admins" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await usersService.createUser({
      username,
      passwordHash,
      fullName,
      role,
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { role, password, pin } = req.body;

    if (req.user.role !== "admin" && role === "admin") {
      return res.status(403).json({ message: "Only admin can assign admin role" });
    }

    // Managers cannot change admin passwords
    if (password || pin) {
      const target = await usersService.getUserById(id);
      if (target?.role === "admin" && req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admin can change admin credentials" });
      }
      const { password: _pw, pin: _pin, ...rest } = req.body;
      const update = { ...rest };
      if (password) update.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      if (pin) update.pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
      const user = await usersService.updateUser(id, update);
      return res.json(user);
    }

    const user = await usersService.updateUser(id, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
};
