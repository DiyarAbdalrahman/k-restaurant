const prisma = require("../../db/prisma");

async function getAllUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
}

async function getUserById(id) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
}

async function createUser({ username, passwordHash, fullName, role }) {
  return prisma.user.create({
    data: { username, passwordHash, fullName, role, isActive: true },
  });
}

async function updateUser(id, data) {
  return prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
};
