// src/modules/menu/menu.service.js
const prisma = require("../../db/prisma");

class MenuService {
  getCategoriesWithItems() {
    return prisma.menuCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
      },
    });
  }

  createCategory(name, sortOrder) {
    return prisma.menuCategory.create({
      data: { name, sortOrder: sortOrder || 0 },
    });
  }

  createItem(data) {
    return prisma.menuItem.create({
      data: {
        categoryId: data.categoryId,
        name: data.name,
        description: data.description,
        basePrice: data.basePrice,
        sku: data.sku,
      },
    });
  }
}

const menuService = new MenuService();

module.exports = { menuService };
