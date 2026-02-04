// src/lib/socket.js
import { io } from "socket.io-client";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export const kitchenSocket = io(`${BACKEND_URL}/kitchen`, {
  transports: ["websocket"],
});
