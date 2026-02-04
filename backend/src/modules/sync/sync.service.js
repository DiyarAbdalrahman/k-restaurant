// src/modules/sync/sync.service.js
const prisma = require("../../db/prisma");


class SyncService {
  async getPendingOutbox(limit) {
    const take = limit || 100;
    return prisma.syncOutbox.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: "asc" },
      take,
    });
  }

  async markProcessed(id) {
    return prisma.syncOutbox.update({
      where: { id },
      data: { processedAt: new Date() },
    });
  }
}

const syncService = new SyncService();

module.exports = { syncService };
