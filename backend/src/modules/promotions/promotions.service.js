const prisma = require("../../db/prisma");

async function listPromotions() {
  return prisma.promotion.findMany({
    include: {
      categories: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function listActivePromotions() {
  const now = new Date();
  return prisma.promotion.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    include: {
      categories: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function createPromotion(data) {
  return prisma.promotion.create({
    data: {
      name: data.name,
      type: data.type,
      amount: Number(data.amount),
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      isActive: data.isActive !== false,
      categories: {
        create: (data.categoryIds || []).map((id) => ({ categoryId: id })),
      },
      items: {
        create: (data.itemIds || []).map((id) => ({ menuItemId: id })),
      },
    },
    include: {
      categories: true,
      items: true,
    },
  });
}

async function updatePromotion(id, data) {
  return prisma.promotion.update({
    where: { id },
    data: {
      name: data.name,
      type: data.type,
      amount: Number(data.amount),
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      isActive: data.isActive,
      categories: {
        deleteMany: {},
        create: (data.categoryIds || []).map((cid) => ({ categoryId: cid })),
      },
      items: {
        deleteMany: {},
        create: (data.itemIds || []).map((iid) => ({ menuItemId: iid })),
      },
    },
    include: {
      categories: true,
      items: true,
    },
  });
}

async function deletePromotion(id) {
  await prisma.promotionCategory.deleteMany({ where: { promotionId: id } });
  await prisma.promotionItem.deleteMany({ where: { promotionId: id } });
  await prisma.orderPromotion.deleteMany({ where: { promotionId: id } });
  return prisma.promotion.delete({ where: { id } });
}

module.exports = {
  listPromotions,
  listActivePromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
};
