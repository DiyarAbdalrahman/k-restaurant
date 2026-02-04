// src/modules/menu/menu.controller.js
const { menuService } = require("./menu.service");

class MenuController {
  async getMenu(req, res, next) {
    try {
      const data = await menuService.getCategoriesWithItems();
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  async createCategory(req, res, next) {
    try {
      const { name, sortOrder } = req.body;
      const cat = await menuService.createCategory(name, sortOrder);
      res.status(201).json(cat);
    } catch (err) {
      next(err);
    }
  }

  async createItem(req, res, next) {
    try {
      const { categoryId, name, description, basePrice, sku } = req.body;
      const item = await menuService.createItem({
        categoryId,
        name,
        description,
        basePrice,
        sku,
      });
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  }
}

const menuController = new MenuController();

module.exports = { menuController };
