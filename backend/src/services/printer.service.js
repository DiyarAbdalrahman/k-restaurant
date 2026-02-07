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
async function sendToPrinter(renderFn, encoding = "GB18030") {
  if (!bridgeUrl && (!printerEnabled || !printerIp)) {
    console.log("[printer] Disabled or no IP set. Skipping print.");
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const options = { encoding };

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
  const width = 42;

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
    const groups = new Map();
    (order.items || []).forEach((item) => {
      const guest = Number(item.guest || 1);
      if (!groups.has(guest)) groups.set(guest, []);
      groups.get(guest).push(item);
    });
    Array.from(groups.keys()).sort((a, b) => a - b).forEach((guest) => {
      printer.text(`Guest ${guest}`);
      groups.get(guest).forEach((item) => {
        const name = item.menuItem?.name || "Item";
        const qty = item.quantity;
        const label = `  ${qty} x ${normalizePrintText(name)}`;
        wrapText(label, width).forEach((line) => printer.text(line));
        if (item.notes) {
          wrapText(`   > ${normalizePrintText(item.notes)}`, width).forEach((line) =>
            printer.text(line)
          );
        }
      });
      printer.drawLine();
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
  }, "GB18030");
}

function formatGBP(value) {
  const n = Number(value || 0);
  // Use ASCII-safe currency to avoid codepage issues on some printers
  return `GBP ${n.toFixed(2)}`;
}

function normalizePrintText(input) {
  const text = String(input || "");
  return text
    .replace(/½/g, "1/2")
    .replace(/¼/g, "1/4")
    .replace(/¾/g, "3/4")
    .replace(/⅓/g, "1/3")
    .replace(/⅔/g, "2/3")
    .replace(/⅛/g, "1/8")
    .replace(/⅜/g, "3/8")
    .replace(/⅝/g, "5/8")
    .replace(/⅞/g, "7/8");
}

function getReceiptWidth(settings) {
  return settings?.receiptPaperSize === "58mm" ? 32 : 42;
}

function wrapText(text, width) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if ((line + " " + word).length <= width) {
      line = line + " " + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function printWrapped(printer, text, width) {
  wrapText(normalizePrintText(text), width).forEach((line) => {
    printer.text(line);
  });
}

function printItemLine(printer, { qty, name, amount }, width) {
  const amountText = formatGBP(amount);
  const amountWidth = Math.max(10, amountText.length + 1);
  const leftWidth = Math.max(10, width - amountWidth);
  const label = `${qty} x ${normalizePrintText(name)}`;
  const lines = wrapText(label, leftWidth);
  if (lines.length === 0) {
    printer.text(amountText);
    return;
  }
  const firstLeft = lines[0].padEnd(leftWidth, " ");
  printer.text(`${firstLeft}${amountText}`);
  for (let i = 1; i < lines.length; i += 1) {
    printer.text(lines[i]);
  }
}

async function printCustomerReceipt(order, settings) {
  const brand = settings?.brandName || "Kurda Restaurant";
  const header = settings?.receiptHeaderText || "";
  const footer = settings?.receiptFooterText || "Thank you!";
  const width = getReceiptWidth(settings);
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
    printer.align("CT").size(1, 1).text("RECEIPT");
    printer.size(1, 1);
    printer.textStyle("NORMAL");
    if (show.brandName) printWrapped(printer, brand, width);
    if (header) printWrapped(printer, header, width);
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
        printItemLine(printer, { qty, name, amount }, width);
        if (show.itemNotes && item.notes) {
          printWrapped(printer, `  > ${item.notes}`, width);
        }
      });
    }

    if (show.totals) {
      printer.drawLine();
      printer.text(`Subtotal: ${formatGBP(order.subtotal)}`);
      if (show.discounts) printer.text(`Discount: -${formatGBP(order.discountAmount)}`);
      printer.text(`Service: ${formatGBP(order.serviceCharge)}`);
      printer.text(`Tax: ${formatGBP(order.taxAmount)}`);
      printer.text(`Total: ${formatGBP(order.total)}`);
      printer.text(`Paid: ${formatGBP(netPaid)}`);
      if (show.balance) printer.text(`Balance: ${formatGBP(remaining)}`);
    }
    if (show.method && lastPayment) {
      printer.text(`Method: ${lastPayment.method}`);
    }

    if (show.footer) {
      printer.drawLine();
      printWrapped(printer, footer, width);
    }
    printer.newLine().cut();
  }, "CP858");
}

module.exports = {
  printKitchenTicket,
  printCustomerReceipt,
};
