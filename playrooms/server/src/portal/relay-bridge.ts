import type { Server } from "socket.io";
import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { validateShareLink } from "../auth/share-links.js";

const logger = createLogger("Portal");
import * as lobby from "../auth/lobby.js";
import * as chatService from "../widgets/chat.service.js";
import * as toyboxService from "../widgets/toybox.service.js";
import { onDevicesChanged } from "../buttplug/client.js";
import { dispatchEvent } from "../webhooks/webhook.service.js";
import * as relayClient from "./relay-client.js";
import type {
  RelayUpstream,
  RelayGuestConnect,
  RelayGuestDisconnect,
  RelayValidateRequest,
  DeviceCommand,
} from "../types/index.js";

/** Maps portal guestId -> { roomId, name, haGuestId } */
const portalGuests = new Map<string, { roomId: string; name: string; haGuestId: string }>();

/**
 * Sets up the relay bridge on the HA side.
 * Listens for relay events from the portal and dispatches them
 * to the existing service layer (lobby, chat, toybox, etc.)
 */
export function setupRelayBridge(io: Server): void {
  const socket = relayClient.getRelaySocket();
  if (!socket) return;

  // Handle new guest connecting via portal
  socket.on("relay:guest:connect", (data: RelayGuestConnect) => {
    handleGuestConnect(io, data);
  });

  // Handle guest disconnecting via portal
  socket.on("relay:guest:disconnect", (data: RelayGuestDisconnect) => {
    handleGuestDisconnect(io, data);
  });

  // Handle upstream events from portal guests
  socket.on("relay:upstream", (envelope: RelayUpstream) => {
    handleUpstreamEvent(io, envelope);
  });

  // Handle token validation requests from portal
  socket.on("relay:validate:request", (data: RelayValidateRequest) => {
    handleValidateRequest(data);
  });

  // Broadcast device state changes to portal guests
  onDevicesChanged((devices) => {
    for (const device of devices) {
      relayClient.broadcastToAll("device:state", device);
    }
  });

  logger.info("Relay bridge initialized");
}

function handleGuestConnect(io: Server, data: RelayGuestConnect): void {
  const { guestId: portalGuestId, roomId, token, name, code } = data;

  // Extract original token from compound token
  const originalToken = extractOriginalToken(token);

  // Validate the share link
  const linkResult = validateShareLink(originalToken);
  if (!linkResult || linkResult.room.id !== roomId) {
    relayClient.emitGuestRejected(portalGuestId, "Invalid share link");
    return;
  }

  // Create pending guest in HA's lobby system
  // Use a synthetic socket ID that identifies this as a portal guest
  const syntheticSocketId = `portal:${portalGuestId}`;
  const { guestId: haGuestId, code: challengeCode } = lobby.createPendingGuest(roomId, name, syntheticSocketId);

  // Track mapping between portal guest and HA guest
  portalGuests.set(portalGuestId, { roomId, name, haGuestId });

  logger.info(`Portal guest "${name}" (${portalGuestId}) -> HA guest ${haGuestId}`);

  // If open mode, auto-approve
  if (linkResult.room.accessMode === "open") {
    lobby.markGuestJoined(haGuestId, syntheticSocketId);
    relayClient.emitGuestApproved(portalGuestId);
    dispatchEvent(roomId, "guest:joined", { guestId: haGuestId, name });

    // Send room state to guest via relay
    sendRoomStateToPortalGuest(portalGuestId, roomId);

    // Notify local host of new guest
    io.to(`room:${roomId}`).emit("guest:joined", { guestId: haGuestId, name });
  } else {
    // Challenge mode — notify local host of pending guest
    io.to(`room:${roomId}:host`).emit("lobby:pending", {
      guestId: haGuestId,
      name,
      code: challengeCode,
    });
  }
}

function handleGuestDisconnect(io: Server, data: RelayGuestDisconnect): void {
  const { guestId: portalGuestId, roomId } = data;
  const mapping = portalGuests.get(portalGuestId);
  if (!mapping) return;

  const syntheticSocketId = `portal:${portalGuestId}`;
  lobby.markGuestDisconnected(syntheticSocketId);
  portalGuests.delete(portalGuestId);

  // Notify local clients
  io.to(`room:${roomId}`).emit("guest:left", { guestId: mapping.haGuestId });
  dispatchEvent(roomId, "guest:left", { guestId: mapping.haGuestId, name: mapping.name });

  logger.info(`Portal guest "${mapping.name}" (${portalGuestId}) disconnected`);
}

function handleUpstreamEvent(io: Server, envelope: RelayUpstream): void {
  const { sourceGuestId, roomId, event, data } = envelope;
  const mapping = portalGuests.get(sourceGuestId);
  if (!mapping) return;

  switch (event) {
    case "device:command":
      handleDeviceCommand(io, roomId, mapping.name, sourceGuestId, data as DeviceCommand);
      break;

    case "chat:message":
      handleChatMessage(io, roomId, mapping.name, sourceGuestId, data as { message: string });
      break;

    case "guest:join":
      handleGuestJoinCode(io, roomId, mapping.haGuestId, mapping.name, sourceGuestId, data as { code?: string });
      break;

    case "lobby:approve":
      handleLobbyApprove(io, roomId, data as { guestId: string }, sourceGuestId);
      break;

    case "lobby:reject":
      handleLobbyReject(io, roomId, data as { guestId: string });
      break;

    default:
      // Unknown event - ignore
      break;
  }
}

async function handleDeviceCommand(
  io: Server,
  roomId: string,
  guestName: string,
  portalGuestId: string,
  cmd: DeviceCommand,
): Promise<void> {
  // Verify device is assigned to this room
  const roomDevices = await toyboxService.getDevicesForRoom(roomId);
  const deviceAllowed = roomDevices.some(
    (d) => d.id === cmd.deviceId || String(d.buttplugIndex) === cmd.deviceId,
  );

  if (!deviceAllowed) {
    relayClient.emitToGuest(portalGuestId, "error", { message: "Device not assigned to this room" });
    return;
  }

  try {
    await toyboxService.sendDeviceCommand(cmd);
    const mapping = portalGuests.get(portalGuestId);
    dispatchEvent(roomId, "command:sent", { ...cmd, guestId: mapping?.haGuestId, guestName });
  } catch (err) {
    relayClient.emitToGuest(portalGuestId, "error", {
      message: `Device command failed: ${(err as Error).message}`,
    });
  }
}

function handleChatMessage(
  io: Server,
  roomId: string,
  guestName: string,
  portalGuestId: string,
  data: { message: string },
): void {
  const msg = chatService.saveMessage(roomId, guestName, data.message);

  // Broadcast to local clients
  io.to(`room:${roomId}`).emit("chat:message", msg);

  // Broadcast to portal guests (excluding sender)
  relayClient.broadcastToRoom(roomId, "chat:message", msg, portalGuestId);

  dispatchEvent(roomId, "chat:message", { senderName: guestName, message: data.message });
}

function handleGuestJoinCode(
  io: Server,
  roomId: string,
  haGuestId: string,
  name: string,
  portalGuestId: string,
  data: { code?: string },
): void {
  if (data.code && lobby.verifyChallengeCode(haGuestId, data.code)) {
    lobby.approveGuest(haGuestId);
    const syntheticSocketId = `portal:${portalGuestId}`;
    lobby.markGuestJoined(haGuestId, syntheticSocketId);
    relayClient.emitGuestApproved(portalGuestId);
    dispatchEvent(roomId, "guest:approved", { guestId: haGuestId, name });

    sendRoomStateToPortalGuest(portalGuestId, roomId);
    io.to(`room:${roomId}`).emit("guest:joined", { guestId: haGuestId, name });
  }
}

function handleLobbyApprove(
  io: Server,
  roomId: string,
  data: { guestId: string },
  _portalGuestId: string,
): void {
  // This handles the case where a portal-connected host approves a guest
  // (future: when hosts can also connect via portal)
  if (lobby.approveGuest(data.guestId)) {
    // Find portal guest mapping for this HA guest
    for (const [pgId, mapping] of portalGuests) {
      if (mapping.haGuestId === data.guestId) {
        const syntheticSocketId = `portal:${pgId}`;
        lobby.markGuestJoined(data.guestId, syntheticSocketId);
        relayClient.emitGuestApproved(pgId);
        sendRoomStateToPortalGuest(pgId, roomId);
        io.to(`room:${roomId}`).emit("guest:joined", { guestId: data.guestId, name: mapping.name });
        dispatchEvent(roomId, "guest:approved", { guestId: data.guestId, name: mapping.name });
        break;
      }
    }
  }
}

function handleLobbyReject(
  io: Server,
  roomId: string,
  data: { guestId: string },
): void {
  lobby.rejectGuest(data.guestId);
  // Find portal guest mapping for this HA guest
  for (const [pgId, mapping] of portalGuests) {
    if (mapping.haGuestId === data.guestId) {
      relayClient.emitGuestRejected(pgId, "Your request to join was rejected");
      portalGuests.delete(pgId);
      dispatchEvent(roomId, "guest:rejected", { guestId: data.guestId });
      break;
    }
  }
}

function handleValidateRequest(data: RelayValidateRequest): void {
  const { requestId, token } = data;
  const originalToken = extractOriginalToken(token);

  const result = validateShareLink(originalToken);
  if (!result) {
    relayClient.emitValidateResponse(requestId, false, undefined, "Invalid or expired share link");
    return;
  }

  const room = result.room;
  relayClient.emitValidateResponse(requestId, true, {
    id: room.id,
    name: room.name,
    accessMode: room.accessMode,
    challengeType: room.challengeType,
    maxGuests: room.maxGuests,
    widgets: JSON.parse(room.widgets).map((w: { type: string }) => w.type),
    guestType: result.link.guestType,
  });
}

async function sendRoomStateToPortalGuest(portalGuestId: string, roomId: string): Promise<void> {
  const guests = lobby.getRoomGuests(roomId);
  const devices = await toyboxService.getDevicesForRoom(roomId);

  relayClient.emitToGuest(portalGuestId, "room:state", {
    guests: guests.map((g) => ({ id: g.id, name: g.name })),
    devices: devices.map((d) => ({
      id: d.id,
      name: d.name,
      connected: d.connected,
      batteryLevel: d.batteryLevel,
      capabilities: d.capabilities,
    })),
  });

  // Send recent chat history
  const messages = chatService.getRecentMessages(roomId, 50);
  for (const msg of messages) {
    relayClient.emitToGuest(portalGuestId, "chat:message", msg);
  }
}

/** Extract original token from compound token (strip instance prefix) */
function extractOriginalToken(compoundToken: string): string {
  const prefixSep = compoundToken.indexOf("_");
  if (prefixSep >= 4) {
    return compoundToken.substring(prefixSep + 1);
  }
  return compoundToken;
}

/** Handle guests that were connected to portal before HA reconnected */
export function handleReconnectedGuests(guests: Array<{ guestId: string; roomId: string; name: string }>): void {
  for (const guest of guests) {
    const syntheticSocketId = `portal:${guest.guestId}`;
    // Re-register as a pending guest — they'll need to re-validate
    try {
      const { guestId: haGuestId } = lobby.createPendingGuest(guest.roomId, guest.name, syntheticSocketId);
      portalGuests.set(guest.guestId, { roomId: guest.roomId, name: guest.name, haGuestId });
      // Auto-approve reconnecting guests
      lobby.approveGuest(haGuestId);
      lobby.markGuestJoined(haGuestId, syntheticSocketId);
      relayClient.emitGuestApproved(guest.guestId);
      sendRoomStateToPortalGuest(guest.guestId, guest.roomId);
    } catch (err) {
      logger.warn(`Failed to re-register portal guest ${guest.guestId}: ${(err as Error).message}`);
    }
  }
}
