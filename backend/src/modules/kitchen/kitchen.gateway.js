// src/modules/kitchen/kitchen.gateway.js
let kitchenNamespace;

function initKitchenGateway(io) {
  kitchenNamespace = io.of("/kitchen");

  kitchenNamespace.on("connection", (socket) => {
    console.log("Kitchen client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("Kitchen client disconnected:", socket.id);
    });
  });
}

function emitOrderUpdated(order) {
  if (!kitchenNamespace) return;
  kitchenNamespace.emit("order:updated", order);
}

module.exports = { initKitchenGateway, emitOrderUpdated };
