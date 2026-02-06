// src/modules/menu/menu.service.js
const prisma = require("../../db/prisma");

class MenuService {
  getCategoriesWithItems(includeInactive = false) {
    return prisma.menuCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          ...(includeInactive ? {} : { where: { isActive: true } }),
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

  updateCategory(id, data) {
    return prisma.menuCategory.update({
      where: { id },
      data,
    });
  }

  deleteCategory(id) {
    return prisma.menuCategory.update({
      where: { id },
      data: { isActive: false },
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
        imageUrl: data.imageUrl,
      },
    });
  }

  updateItem(id, data) {
    return prisma.menuItem.update({
      where: { id },
      data,
    });
  }

  deleteItem(id) {
    return prisma.menuItem.delete({ where: { id } });
  }
}

const menuService = new MenuService();

module.exports = { menuService };
