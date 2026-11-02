"use client";

import { io } from "socket.io-client";

export function isRealtimeEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true"
  );
}

export function getRealtimeSocket() {
  if (typeof window === "undefined" || !isRealtimeEnabled()) return null;

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
