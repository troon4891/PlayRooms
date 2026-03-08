import type { Server } from "socket.io";
import { nanoid } from "nanoid";
import * as registry from "./instance-registry.js";
import * as guestBridge from "./guest-bridge.js";
import { RELAY_ALLOWED_EVENTS } from "../types/index.js";

/** Max events per guest per second (flood protection) */
const MAX_EVENTS_PER_SECOND = 50;

/**
 * Sets up guest Socket.IO connections on the default namespace.
 * Guests connect with query params: { roomId, token, name }
 * Their events are relayed upstream to the appropriate HA instance.
 */
export function setupGuestNamespace(io: Server): void {
  io.on("connection", (socket) => {
    const query = socket.handshake.query;
    const roomId = query.roomId as string;
    const token = query.token as string;
    const name = query.name as string;
    const isHost = query.isHost === "true";

    // Portal does not accept host connections
    if (isHost) {
      socket.emit("error", { message: "Host connections are not supported on the portal" });
      socket.disconnect();
      return;
    }

    if (!roomId || !token || !name) {
      socket.emit("error", { message: "roomId, token, and name are required" });
      socket.disconnect();
      return;
    }

    // Extract instance prefix from compound token
    const prefixSep = token.indexOf("_");
    if (prefixSep === -1 || prefixSep < 4) {
      socket.emit("error", { message: "Invalid share link format" });
      socket.disconnect();
      return;
    }

    const prefix = token.substring(0, prefixSep);
    const instanceId = registry.getInstanceIdByPrefix(prefix);

    if (!instanceId) {
      // Try single-instance fallback
      const defaultInstance = registry.getDefaultInstance();
      if (!defaultInstance) {
        socket.emit("error", { message: "Host is offline" });
        socket.disconnect();
        return;
      }
      // Use default instance
      setupGuestRelay(io, socket, defaultInstance.instanceId, defaultInstance.socket, roomId, token, name);
      return;
    }

    const haSocket = registry.getInstance(instanceId);
    if (!haSocket) {
      socket.emit("error", { message: "Host is offline" });
      socket.disconnect();
      return;
    }

    setupGuestRelay(io, socket, instanceId, haSocket, roomId, token, name);
  });
}

function setupGuestRelay(
  _io: Server,
  socket: import("socket.io").Socket,
  instanceId: string,
  haSocket: import("socket.io").Socket,
  roomId: string,
  token: string,
  name: string,
): void {
  const portalGuestId = nanoid();

  // Register guest in the bridge
  guestBridge.registerGuest(portalGuestId, socket, instanceId, roomId, name);

  // Notify HA of new guest connection
  haSocket.emit("relay:guest:connect", {
    guestId: portalGuestId,
    roomId,
    token,
    name,
  });

  // Rate limiting state
  let eventCount = 0;
  const rateLimitInterval = setInterval(() => {
    eventCount = 0;
  }, 1000);

  // Relay allowed guest events upstream to HA
  for (const eventName of RELAY_ALLOWED_EVENTS) {
    socket.on(eventName, (data: unknown) => {
      // Rate limit check
      eventCount++;
      if (eventCount > MAX_EVENTS_PER_SECOND) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }

      // Check that HA is still connected
      const currentHaSocket = registry.getInstance(instanceId);
      if (!currentHaSocket) {
        socket.emit("error", { message: "Host is temporarily offline" });
        return;
      }

      currentHaSocket.emit("relay:upstream", {
        sourceGuestId: portalGuestId,
        roomId,
        event: eventName,
        data,
      });
    });
  }

  // Handle guest disconnect
  socket.on("disconnect", () => {
    clearInterval(rateLimitInterval);
    guestBridge.removeGuest(portalGuestId);

    // Notify HA if still connected
    const currentHaSocket = registry.getInstance(instanceId);
    if (currentHaSocket) {
      currentHaSocket.emit("relay:guest:disconnect", {
        guestId: portalGuestId,
        roomId,
      });
    }
  });
}
