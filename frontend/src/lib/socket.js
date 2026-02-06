// src/lib/socket.js
import { io } from "socket.io-client";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export const kitchenSocket = io(`${BACKEND_URL}/kitchen`, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 800,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
});
