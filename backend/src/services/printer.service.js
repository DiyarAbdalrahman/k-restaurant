// src/services/printer.service.js
const escpos = require("escpos");
escpos.Network = require("escpos-network");

const printerIp = process.env.KITCHEN_PRINTER_IP;
const printerPort = Number(process.env.KITCHEN_PRINTER_PORT || 9100);
const printerEnabled = process.env.KITCHEN_PRINTER_ENABLED === "true";

if (!printerIp) {
  console.warn(
    "[printer] KITCHEN_PRINTER_IP is not set. Kitchen printing is disabled."
  );
}

// Format mm/dd hh:mm for ticket
function formatTime(dateString) {
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${mins}`;
}

/**
 * Print kitchen ticket for an order
 * @param {Object} order - order including items + table
 */
async function printKitchenTicket(order) {
  if (!printerEnabled || !printerIp) {
    console.log("[printer] Disabled or no IP set. Skipping print.");
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const device = new escpos.Network(printerIp, printerPort);
      const options = { encoding: "GB18030" }; // safe default
      const printer = new escpos.Printer(device, options);

      device.open((err) => {
        if (err) {
          console.error("[printer] Failed to open device:", err);
          return reject(err);
        }

        const isDineIn = order.type === "dine_in";
        const tableName = order.table?.name || "-";

        printer
          .align("CT")
          .size(2, 2)
          .text("KITCHEN ORDER")
          .size(1, 1)
          .text(`Order: ${order.id.slice(0, 8)}`)
          .text(isDineIn ? `TABLE: ${tableName}` : "TAKEAWAY")
          .text(formatTime(order.createdAt))
          .drawLine();

        printer.align("LT").text("Items:");

        // Items list
        order.items.forEach((item) => {
          const name = item.menuItem?.name || "Item";
          const qty = item.quantity;
          printer.text(`${qty} x ${name}`);
          if (item.notes) {
            printer.text(`  > ${item.notes}`);
          }
        });

        printer.drawLine();

        // Notes
        if (order.notes) {
          printer.text(`Notes: ${order.notes}`);
        }

        printer.newLine();
        printer.text("----------------------------");
        printer.text("       ** KITCHEN **");
        printer.text("----------------------------");
        printer.newLine().cut().close();

        resolve();
      });
    } catch (e) {
      console.error("[printer] Unexpected error:", e);
      reject(e);
    }
  });
}

module.exports = {
  printKitchenTicket,
};
