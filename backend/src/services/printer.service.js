// src/services/printer.service.js
const escpos = require("escpos");
escpos.Network = require("escpos-network");

const printerIp = process.env.KITCHEN_PRINTER_IP;
const printerPort = Number(process.env.KITCHEN_PRINTER_PORT || 9100);
const printerEnabled = process.env.KITCHEN_PRINTER_ENABLED === "true";
const bridgeUrl = process.env.PRINT_BRIDGE_URL;
const bridgeSecret = process.env.PRINT_BRIDGE_SECRET;

if (!printerIp) {
  console.warn(
    "[printer] KITCHEN_PRINTER_IP is not set. Kitchen printing is disabled."
  );
}
if (bridgeUrl) {
  console.log("[printer] Using print bridge:", bridgeUrl);
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
async function sendToPrinter(renderFn) {
  if (!bridgeUrl && (!printerEnabled || !printerIp)) {
    console.log("[printer] Disabled or no IP set. Skipping print.");
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const options = { encoding: "GB18030" };

      if (bridgeUrl) {
        const chunks = [];
        const device = {
          open: (cb) => cb && cb(),
          write: (data) => chunks.push(Buffer.from(data)),
          close: (cb) => cb && cb(),
        };
        const printer = new escpos.Printer(device, options);
        renderFn(printer);
        printer.close();
        const raw = Buffer.concat(chunks).toString("base64");

        const headers = { "Content-Type": "application/json" };
        if (bridgeSecret) headers["x-print-secret"] = bridgeSecret;

        fetch(bridgeUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ raw }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const text = await res.text().catch(() => "");
              throw new Error(`Bridge error ${res.status}: ${text}`);
            }
            resolve();
          })
          .catch((err) => {
            console.error("[printer] Bridge print failed:", err);
            reject(err);
          });
        return;
      }

      const device = new escpos.Network(printerIp, printerPort);
      const printer = new escpos.Printer(device, options);

      device.open((err) => {
        if (err) {
          console.error("[printer] Failed to open device:", err);
          return reject(err);
        }
        renderFn(printer);
        printer.close();
        resolve();
      });
    } catch (e) {
      console.error("[printer] Unexpected error:", e);
      reject(e);
    }
  });
}

async function printKitchenTicket(order) {
  const isDineIn = order.type === "dine_in";
  const tableName = order.table?.name || "-";
  const takenBy =
    order.openedByUser?.fullName ||
    order.openedByUser?.username ||
    "-";

  return sendToPrinter((printer) => {
    printer
      .align("CT")
      .size(2, 2)
      .text("KITCHEN ORDER")
      .size(1, 1)
      .text(`Order: ${order.id.slice(0, 8)}`)
      .text(`Taken by: ${takenBy}`)
      .text(isDineIn ? `TABLE: ${tableName}` : "TAKEAWAY")
      .text(formatTime(order.createdAt))
      .drawLine();

    printer.align("LT").text("Items:");
    order.items.forEach((item) => {
      const name = item.menuItem?.name || "Item";
      const qty = item.quantity;
      printer.text(`${qty} x ${name}`);
      if (item.notes) {
        printer.text(`  > ${item.notes}`);
      }
    });

    printer.drawLine();
    if (order.notes) {
      printer.text(`Notes: ${order.notes}`);
    }
    printer.newLine();
    printer.text("----------------------------");
    printer.text("       ** KITCHEN **");
    printer.text("----------------------------");
    printer.newLine().cut();
  });
}

async function printCustomerReceipt(order, settings) {
  const brand = settings?.brandName || "Kurda Restaurant";
  const header = settings?.receiptHeaderText || "";
  const footer = settings?.receiptFooterText || "Thank you!";
  const show = {
    brandName: settings?.receiptShowBrandName !== false,
    orderId: settings?.receiptShowOrderId !== false,
    tableType: settings?.receiptShowTableType !== false,
    takenBy: settings?.receiptShowTakenBy !== false,
    time: settings?.receiptShowTime !== false,
    items: settings?.receiptShowItems !== false,
    itemNotes: settings?.receiptShowItemNotes !== false,
    totals: settings?.receiptShowTotals !== false,
    discounts: settings?.receiptShowDiscounts !== false,
    balance: settings?.receiptShowBalance !== false,
    method: settings?.receiptShowPaymentMethod !== false,
    footer: settings?.receiptShowFooter !== false,
  };

  const payments = Array.isArray(order.payments) ? order.payments : [];
  const paid = payments.filter((p) => p.kind !== "refund").reduce((s, p) => s + Number(p.amount || 0), 0);
  const refunded = payments.filter((p) => p.kind === "refund").reduce((s, p) => s + Number(p.amount || 0), 0);
  const netPaid = paid - refunded;
  const remaining = Math.max(0, Number(order.total || 0) - netPaid);
  const lastPayment = payments.filter((p) => p.kind !== "refund").slice(-1)[0];

  return sendToPrinter((printer) => {
    printer.align("CT").size(2, 2).text("RECEIPT").size(1, 1);
    if (show.brandName) printer.text(brand);
    if (header) printer.text(header);
    printer.drawLine();

    if (show.orderId) printer.text(`Order: ${String(order.id).slice(0, 8)}`);
    if (show.tableType) {
      const label = order.type === "dine_in" ? `Table: ${order.table?.name || "-"}` : "Takeaway";
      printer.text(label);
    }
    if (show.takenBy && order.openedByUser) {
      printer.text(`Cashier: ${order.openedByUser.fullName || order.openedByUser.username}`);
    }
    if (show.time) printer.text(formatTime(order.createdAt));

    if (show.items) {
      printer.drawLine();
      order.items.forEach((item) => {
        const name = item.menuItem?.name || "Item";
        const qty = item.quantity;
        const amount = Number(item.totalPrice || item.unitPrice * item.quantity || 0).toFixed(2);
        printer.text(`${qty} x ${name}  £${amount}`);
        if (show.itemNotes && item.notes) {
          printer.text(`  > ${item.notes}`);
        }
      });
    }

    if (show.totals) {
      printer.drawLine();
      printer.text(`Subtotal: £${Number(order.subtotal || 0).toFixed(2)}`);
      if (show.discounts) printer.text(`Discount: -£${Number(order.discountAmount || 0).toFixed(2)}`);
      printer.text(`Service: £${Number(order.serviceCharge || 0).toFixed(2)}`);
      printer.text(`Tax: £${Number(order.taxAmount || 0).toFixed(2)}`);
      printer.text(`Total: £${Number(order.total || 0).toFixed(2)}`);
      printer.text(`Paid: £${Number(netPaid || 0).toFixed(2)}`);
      if (show.balance) printer.text(`Balance: £${Number(remaining || 0).toFixed(2)}`);
    }
    if (show.method && lastPayment) {
      printer.text(`Method: ${lastPayment.method}`);
    }

    if (show.footer) {
      printer.drawLine();
      printer.text(footer);
    }
    printer.newLine().cut();
  });
}

module.exports = {
  printKitchenTicket,
  printCustomerReceipt,
};
