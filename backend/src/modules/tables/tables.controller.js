// src/modules/tables/tables.controller.js
const { tablesService } = require("./tables.service");

class TablesController {
  async list(req, res, next) {
    try {
      const tables = await tablesService.listTables();
      res.json(tables);
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { name, area, sortOrder } = req.body;
      const table = await tablesService.createTable(name, area, sortOrder);
      res.status(201).json(table);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const table = await tablesService.updateTable(id, req.body);
      res.json(table);
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const { id } = req.params;
      await tablesService.deleteTable(id);
      res.json({ message: "Table deleted" });
    } catch (err) {
      next(err);
    }
  }
}

const tablesController = new TablesController();

module.exports = { tablesController };
