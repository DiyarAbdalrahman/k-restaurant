// src/modules/reports/reports.controller.js
const { reportsService } = require("./reports.service");

class ReportsController {
  async summary(req, res, next) {
    try {
      const { from, to, method = "all", type = "all" } = req.query;
      res.json(await reportsService.summary({ from, to, method, type }));
    } catch (e) { next(e); }
  }

  async items(req, res, next) {
    try {
      const { from, to, sort = "top", limit = 20, q = "", categoryId = "all", type = "all" } = req.query;
      res.json(await reportsService.items({ from, to, sort, limit, q, categoryId, type }));
    } catch (e) { next(e); }
  }

  async slowAlerts(req, res, next) {
    try {
      const { from, to, limit = 10 } = req.query;
      res.json(await reportsService.slowAlerts({ from, to, limit }));
    } catch (e) { next(e); }
  }
}

const reportsController = new ReportsController();
module.exports = { reportsController };
