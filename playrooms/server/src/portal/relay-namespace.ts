import type { Server } from "socket.io";
import { config } from "../config.js";
import { createLogger } from "../logger.js";
import * as registry from "./instance-registry.js";

const logger = createLogger("Portal");
import * as guestBridge from "./guest-bridge.js";
import * as tokenCache from "./token-cache.js";
import type {
  RelayDownstream,
  RelayBroadcast,
  RelayValidateResponse,
} from "../types/index.js";

/**
 * Sets up the /relay namespace on the Portal server.
 * HA instances connect here as Socket.IO clients to relay events.
 */
export function setupRelayNamespace(io: Server): void {
  const relayNs = io.of("/relay");

  // Authentication middleware
  relayNs.use((socket, next) => {
    const { instanceId, secret } = socket.handshake.auth as {
      instanceId?: string;
      secret?: string;
    };

    if (!instanceId || !secret) {
      return next(new Error("Missing instanceId or secret"));
    }

    if (secret !== config.portalSecret) {
      logger.warn(`Auth failed for instance ${instanceId}: invalid secret`);
      return next(new Error("Authentication failed"));
    }

    socket.data.instanceId = instanceId;
    next();
  });

  relayNs.on("connection", (socket) => {
    const instanceId = socket.data.instanceId as string;
    registry.registerInstance(instanceId, socket);

    // Notify HA of any guests that are still connected (reconnection scenario)
    const existingGuests = guestBridge.getGuestsForInstance(instanceId);
    if (existingGuests.length > 0) {
      socket.emit("relay:ha:reconnected", {
        guests: existingGuests.map((g) => ({
          guestId: g.guestId,
          roomId: g.roomId,
          name: g.name,
        })),
      });
    }

    // Handle downstream events: HA -> specific guest
    socket.on("relay:downstream", (envelope: RelayDownstream) => {
      const guestSocket = guestBridge.getGuestSocket(envelope.targetGuestId);
      if (guestSocket) {
        guestSocket.emit(envelope.event, envelope.data);
      }
    });

    // Handle downstream room broadcast: HA -> all guests in a room
    socket.on("relay:downstream:room", (data: RelayBroadcast) => {
      const guests = guestBridge.getGuestsInRoom(data.roomId);
      for (const guest of guests) {
        if (guest.guestId !== data.excludeGuest) {
          const guestSocket = guestBridge.getGuestSocket(guest.guestId);
          if (guestSocket) {
            guestSocket.emit(data.event, data.data);
          }
        }
      }
    });

    // Handle downstream broadcast to all guests for this instance
    socket.on("relay:downstream:all", (data: { event: string; data: unknown }) => {
      const allGuests = guestBridge.getGuestsForInstance(instanceId);
      for (const guest of allGuests) {
        const guestSocket = guestBridge.getGuestSocket(guest.guestId);
        if (guestSocket) {
          guestSocket.emit(data.event, data.data);
        }
      }
    });

    // Handle guest approval from HA
    socket.on("relay:guest:approved", (data: { guestId: string }) => {
      const guestSocket = guestBridge.getGuestSocket(data.guestId);
      if (guestSocket) {
        guestSocket.emit("guest:approved", { guestId: data.guestId });
        guestBridge.markApproved(data.guestId);
      }
    });

    // Handle guest rejection from HA
    socket.on("relay:guest:rejected", (data: { guestId: string; message?: string }) => {
      const guestSocket = guestBridge.getGuestSocket(data.guestId);
      if (guestSocket) {
        guestSocket.emit("error", { message: data.message || "Your request to join was rejected" });
        guestSocket.disconnect();
      }
      guestBridge.removeGuest(data.guestId);
    });

    // Handle token validation responses
    socket.on("relay:validate:response", (data: RelayValidateResponse) => {
      tokenCache.resolveValidation(data.requestId, data);
    });

    // Heartbeat
    socket.on("relay:ping", () => {
      socket.emit("relay:pong", { timestamp: Date.now() });
    });

    // HA disconnect
    socket.on("disconnect", (reason) => {
      logger.info(`HA instance disconnected: ${instanceId} (${reason})`);
      registry.unregisterInstance(instanceId);

      // Notify all guests for this instance
      const affectedGuests = guestBridge.getGuestsForInstance(instanceId);
      for (const guest of affectedGuests) {
        const guestSocket = guestBridge.getGuestSocket(guest.guestId);
        if (guestSocket) {
          guestSocket.emit("error", { message: "Host is temporarily offline. Reconnecting..." });
        }
      }

      // Start grace period timer - disconnect guests if HA doesn't reconnect
      const gracePeriodMs = Number(process.env.PORTAL_GRACE_PERIOD_MS ?? 60_000);
      setTimeout(() => {
        // Check if HA reconnected with the same instanceId
        if (!registry.getInstance(instanceId)) {
          logger.info(`Grace period expired for instance ${instanceId}, disconnecting guests`);
          const guests = guestBridge.getGuestsForInstance(instanceId);
          for (const guest of guests) {
            const guestSocket = guestBridge.getGuestSocket(guest.guestId);
            if (guestSocket) {
              guestSocket.emit("error", { message: "Host has gone offline" });
              guestSocket.disconnect();
            }
          }
          guestBridge.removeAllForInstance(instanceId);
        }
      }, gracePeriodMs);
    });
  });
}
