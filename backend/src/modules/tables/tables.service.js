// src/modules/tables/tables.service.js
const prisma = require("../../db/prisma");


class TablesService {
  listTables() {
    return prisma.diningTable.findMany({
      orderBy: { name: "asc" },
    });
  }

  createTable(name, area) {
    return prisma.diningTable.create({
      data: { name, area },
    });
  }
}

const tablesService = new TablesService();

module.exports = { tablesService };
