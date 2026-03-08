import { io, Socket } from "socket.io-client";
import { basePath } from "./ingress";

let socket: Socket | null = null;

interface ConnectOptions {
  roomId: string;
  isHost?: boolean;
  token?: string;
  name?: string;
}

export function connectSocket(options: ConnectOptions): Socket {
  if (socket?.connected) {
    socket.disconnect();
  }

  socket = io(window.location.origin, {
    path: basePath + "/socket.io",
    query: {
      roomId: options.roomId,
      isHost: options.isHost ? "true" : "false",
      token: options.token ?? "",
      name: options.name ?? "",
    },
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  socket.on("error", (data: { message: string }) => {
    console.error("[Socket] Error:", data.message);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
