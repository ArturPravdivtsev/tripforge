import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

export function getRealtimeSocket(): Socket<
  ServerToClientEvents,
  ClientToServerEvents
> {
  if (typeof window === "undefined") {
    throw new Error("Realtime socket is only available in the browser");
  }

  socket ??= io(window.location.origin, {
    // Next redirects trailing slashes before Proxy; upgrades cannot redirect.
    addTrailingSlash: false,
    autoConnect: false,
    path: "/socket.io",
    transports: ["websocket"],
    withCredentials: true,
  });

  return socket;
}
