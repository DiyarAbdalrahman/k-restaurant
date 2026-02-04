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

module.exports = {
  getAllUsers,
};
