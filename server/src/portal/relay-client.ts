import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { Server } from "socket.io";
import { config } from "../config.js";
import { createLogger } from "../logger.js";

const logger = createLogger("Portal");
import type {
  RelayUpstream,
  RelayGuestConnect,
  RelayGuestDisconnect,
  RelayValidateRequest,
  RelayHaReconnected,
} from "../types/index.js";

let relaySocket: ClientSocket | null = null;
let localIo: Server | null = null;

/**
 * Connects the HA server outbound to a Portal relay server.
 * This allows the HA instance to relay events for remote guests
 * without requiring port forwarding.
 */
export async function connectToPortal(io: Server): Promise<void> {
  if (!config.portalUrl || !config.portalSecret) {
    throw new Error("portalUrl and portalSecret are required");
  }

  localIo = io;

  logger.info(`Relay client connecting to portal: ${config.portalUrl}`);

  relaySocket = ioClient(config.portalUrl, {
    path: "/relay",
    auth: {
      instanceId: config.portalInstanceId,
      secret: config.portalSecret,
    },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    reconnectionAttempts: Infinity,
  });

  relaySocket.on("connect", () => {
    logger.info("Relay client connected to portal");

    // Announce HA status
    relaySocket!.emit("relay:ha:status", {
      status: "ready",
    });
  });

  relaySocket.on("disconnect", (reason) => {
    logger.warn(`Relay client disconnected from portal: ${reason}`);
  });

  relaySocket.on("connect_error", (err) => {
    logger.warn(`Relay client connection error: ${err.message}`);
  });

  // Handle heartbeat
  relaySocket.on("relay:pong", () => {
    // Heartbeat acknowledged
  });

  // Handle reconnection notification — portal tells us which guests are still connected
  relaySocket.on("relay:ha:reconnected", async (data: RelayHaReconnected) => {
    logger.info(`Relay client reconnected with ${data.guests.length} guests still on portal`);
    // The relay bridge will handle re-registering these guests
    const relayBridge = await import("./relay-bridge.js");
    relayBridge.handleReconnectedGuests(data.guests);
  });

  // Start heartbeat interval
  const heartbeatInterval = setInterval(() => {
    if (relaySocket?.connected) {
      relaySocket.emit("relay:ping");
    }
  }, 30_000);

  // Cleanup on process exit
  process.on("SIGTERM", () => {
    clearInterval(heartbeatInterval);
    relaySocket?.disconnect();
  });

  // Wait for initial connection
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Portal connection timed out after 10s"));
    }, 10_000);

    relaySocket!.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });

    relaySocket!.once("connect_error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Portal connection failed: ${err.message}`));
    });
  });
}

/** Get the relay socket for sending events to the portal */
export function getRelaySocket(): ClientSocket | null {
  return relaySocket;
}

/** Check if the relay connection is active */
export function isRelayConnected(): boolean {
  return relaySocket?.connected ?? false;
}

/** Send a downstream event to a specific guest via the portal */
export function emitToGuest(targetGuestId: string, event: string, data: unknown): void {
  if (!relaySocket?.connected) return;
  relaySocket.emit("relay:downstream", { targetGuestId, event, data });
}

/** Broadcast an event to all guests in a room via the portal */
export function broadcastToRoom(roomId: string, event: string, data: unknown, excludeGuest?: string): void {
  if (!relaySocket?.connected) return;
  relaySocket.emit("relay:downstream:room", { roomId, event, data, excludeGuest });
}

/** Broadcast an event to all connected guests via the portal */
export function broadcastToAll(event: string, data: unknown): void {
  if (!relaySocket?.connected) return;
  relaySocket.emit("relay:downstream:all", { event, data });
}

/** Notify portal that a guest was approved */
export function emitGuestApproved(guestId: string): void {
  if (!relaySocket?.connected) return;
  relaySocket.emit("relay:guest:approved", { guestId });
}

/** Notify portal that a guest was rejected */
export function emitGuestRejected(guestId: string, message?: string): void {
  if (!relaySocket?.connected) return;
  relaySocket.emit("relay:guest:rejected", { guestId, message });
}

/** Send a token validation response back to the portal */
export function emitValidateResponse(requestId: string, valid: boolean, roomInfo?: unknown, error?: string): void {
  if (!relaySocket?.connected) return;
  relaySocket.emit("relay:validate:response", { requestId, valid, roomInfo, error });
}
