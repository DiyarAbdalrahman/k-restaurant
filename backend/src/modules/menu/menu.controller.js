// src/modules/menu/menu.controller.js
const { menuService } = require("./menu.service");

class MenuController {
  async getMenu(req, res, next) {
    try {
      const data = await menuService.getCategoriesWithItems(false);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  async getMenuAdmin(req, res, next) {
    try {
      const data = await menuService.getCategoriesWithItems(true);
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

  async updateCategory(req, res, next) {
    try {
      const { id } = req.params;
      const cat = await menuService.updateCategory(id, req.body);
      res.json(cat);
    } catch (err) {
      next(err);
    }
  }

  async deleteCategory(req, res, next) {
    try {
      const { id } = req.params;
      await menuService.deleteCategory(id);
      res.json({ message: "Category archived" });
    } catch (err) {
      next(err);
    }
  }

  async createItem(req, res, next) {
    try {
      const { categoryId, name, description, basePrice, sku, imageUrl } = req.body;
      const item = await menuService.createItem({
        categoryId,
        name,
        description,
        basePrice,
        sku,
        imageUrl,
      });
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  }

  async updateItem(req, res, next) {
    try {
      const { id } = req.params;
      const item = await menuService.updateItem(id, req.body);
      res.json(item);
    } catch (err) {
      next(err);
    }
  }

  async deleteItem(req, res, next) {
    try {
      const { id } = req.params;
      await menuService.deleteItem(id);
      res.json({ message: "Item deleted" });
    } catch (err) {
      next(err);
    }
  }
}

const menuController = new MenuController();

module.exports = { menuController };
