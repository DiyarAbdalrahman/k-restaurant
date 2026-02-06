// src/modules/tables/tables.service.js
const prisma = require("../../db/prisma");


class TablesService {
  listTables() {
    return prisma.diningTable.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async createTable(name, area, sortOrder) {
    let order = Number.isFinite(sortOrder) ? sortOrder : null;
    if (order === null) {
      const agg = await prisma.diningTable.aggregate({ _max: { sortOrder: true } });
      order = Number(agg._max.sortOrder || 0) + 1;
    }
    return prisma.diningTable.create({
      data: { name, area, sortOrder: order },
    });
  }

  updateTable(id, data) {
    return prisma.diningTable.update({
      where: { id },
      data,
    });
  }

  deleteTable(id) {
    return prisma.diningTable.delete({
      where: { id },
    });
  }
}

const tablesService = new TablesService();

module.exports = { tablesService };
