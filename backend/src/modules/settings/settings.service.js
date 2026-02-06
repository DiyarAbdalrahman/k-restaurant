const prisma = require("../../db/prisma");

async function getSettings() {
  const existing = await prisma.settings.findFirst();
  if (existing) return existing;
  return prisma.settings.create({ data: {} });
}

async function updateSettings(data) {
  const existing = await prisma.settings.findFirst();
  if (existing) {
    return prisma.settings.update({
      where: { id: existing.id },
      data,
    });
  }
  return prisma.settings.create({ data });
}

module.exports = { getSettings, updateSettings };
