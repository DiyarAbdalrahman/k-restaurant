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
      const { name, area } = req.body;
      const table = await tablesService.createTable(name, area);
      res.status(201).json(table);
    } catch (err) {
      next(err);
    }
  }
}

const tablesController = new TablesController();

module.exports = { tablesController };
