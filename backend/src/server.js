// src/server.js
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const app = require("./app");
const { env } = require("./config/env");
const { initKitchenGateway } = require("./modules/kitchen/kitchen.gateway");

const PORT = env.PORT;

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
  },
});

// Init kitchen sockets
initKitchenGateway(io);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
