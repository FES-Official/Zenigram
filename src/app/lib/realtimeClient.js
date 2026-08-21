"use client";

import { io } from "socket.io-client";

export function getRealtimeSocket() {
  if (typeof window === "undefined") return null;

  if (!globalThis.__linkexSocket) {
    globalThis.__linkexSocket = io({
      path: "/api/socket_io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }

  return globalThis.__linkexSocket;
}
