import type { Server, Socket } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "../types/index.js";
import { config } from "../config.js";
import { validateShareLink } from "../auth/share-links.js";
import { verifyToken } from "../auth/tokens.js";
import * as lobby from "../auth/lobby.js";
import * as chatService from "../widgets/chat.service.js";
import * as toyboxService from "../widgets/toybox.service.js";
import * as mediaSignaling from "../widgets/media.signaling.js";
import { onDevicesChanged } from "../buttplug/client.js";
import { dispatchEvent } from "../webhooks/webhook.service.js";
import { createLogger } from "../logger.js";

const logger = createLogger("Room");

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Track host sockets per room
const hostSockets = new Map<string, string>(); // roomId -> socketId
// Track guest sockets for host-approval flow
const guestSockets = new Map<string, { socket: IOSocket; roomId: string; name: string }>(); // guestId -> info

function verifyHostConnection(socket: IOSocket): boolean {
  if (config.authMode === "ha-ingress") {
    // HA mode: check ingress header or local origin
    const headers = socket.handshake.headers;
    const ingressPath = headers["x-ingress-path"];
    const origin = socket.handshake.address;
    const isLocal = origin === "127.0.0.1" || origin === "::1" || origin === "172.30.32.2";
    return !!(ingressPath || isLocal);
  }

  // Standalone mode: require valid JWT
  const jwt = socket.handshake.query.jwt as string;
  if (!jwt) return false;
  const payload = verifyToken(jwt);
  return payload !== null;
}

// Join a guest socket into the room after approval
function finalizeGuestJoin(io: IOServer, socket: IOSocket, roomId: string, guestId: string, name: string): void {
  lobby.markGuestJoined(guestId, socket.id);
  socket.join(`room:${roomId}`);
  io.to(`room:${roomId}`).emit("guest:joined", { guestId, name });
  socket.emit("guest:approved", { guestId });
  dispatchEvent(roomId, "guest:joined", { guestId, name });

  // Send recent chat history
  const messages = chatService.getRecentMessages(roomId, 50);
  for (const msg of messages) {
    socket.emit("chat:message", msg);
  }

  // Setup media signaling
  mediaSignaling.addParticipant(roomId, guestId, socket.id, name);
  mediaSignaling.setupMediaSignaling(io, socket, roomId, guestId);

  // Clean up guest socket tracking (no longer pending)
  guestSockets.delete(guestId);
}

export function setupRoomSockets(io: IOServer): void {
  // Broadcast device state changes to all connected clients
  onDevicesChanged((devices) => {
    for (const device of devices) {
      io.emit("device:state", device);
    }
  });

  io.on("connection", (socket: IOSocket) => {
    const query = socket.handshake.query;
    const roomId = query.roomId as string;
    const isHost = query.isHost === "true";
    const token = query.token as string;
    const guestName = query.name as string;

    if (!roomId) {
      socket.emit("error", { message: "roomId is required" });
      socket.disconnect();
      return;
    }

    if (isHost) {
      // Verify host identity server-side instead of trusting client flag
      if (!verifyHostConnection(socket)) {
        socket.emit("error", { message: "Host authentication failed" });
        socket.disconnect();
        return;
      }
      handleHostConnection(io, socket, roomId);
    } else if (token && guestName) {
      handleGuestConnection(io, socket, roomId, token, guestName);
    } else {
      socket.emit("error", { message: "Invalid connection parameters" });
      socket.disconnect();
    }
  });
}

async function handleHostConnection(io: IOServer, socket: IOSocket, roomId: string): Promise<void> {
  hostSockets.set(roomId, socket.id);
  socket.join(`room:${roomId}`);
  socket.join(`room:${roomId}:host`);

  logger.info(`[${roomId}] Host connected`);

  // Send current room state
  const guests = lobby.getRoomGuests(roomId);
  const devices = await toyboxService.getDevicesForRoom(roomId);
  socket.emit("room:state", {
    guests: guests.map((g) => ({ id: g.id, name: g.name })),
    devices: devices.map((d) => ({
      id: d.id,
      name: d.name,
      connected: d.connected,
      batteryLevel: d.batteryLevel,
      capabilities: d.capabilities,
    })),
  });

  // Send recent chat history to host
  const chatMessages = chatService.getRecentMessages(roomId, 50);
  for (const msg of chatMessages) {
    socket.emit("chat:message", msg);
  }

  // Host lobby management
  socket.on("lobby:approve", (data) => {
    if (lobby.approveGuest(data.guestId)) {
      logger.info(`[${roomId}] Guest approved: ${data.guestId}`);
      // Find the pending guest's socket and join them to the room
      const guestInfo = guestSockets.get(data.guestId);
      if (guestInfo) {
        finalizeGuestJoin(io, guestInfo.socket, roomId, data.guestId, guestInfo.name);
        dispatchEvent(roomId, "guest:approved", { guestId: data.guestId, name: guestInfo.name });
      } else {
        // Guest socket not found (may have disconnected)
        io.to(`room:${roomId}`).emit("guest:approved", { guestId: data.guestId });
        dispatchEvent(roomId, "guest:approved", { guestId: data.guestId });
      }
    }
  });

  socket.on("lobby:reject", (data) => {
    logger.info(`[${roomId}] Guest rejected: ${data.guestId}`);
    lobby.rejectGuest(data.guestId);
    // Notify the guest they were rejected and disconnect them
    const guestInfo = guestSockets.get(data.guestId);
    if (guestInfo) {
      guestInfo.socket.emit("error", { message: "Your request to join was rejected" });
      guestInfo.socket.disconnect();
      guestSockets.delete(data.guestId);
    }
    dispatchEvent(roomId, "guest:rejected", { guestId: data.guestId });
  });

  // Host device commands
  socket.on("device:command", async (cmd) => {
    try {
      await toyboxService.sendDeviceCommand(cmd);
      dispatchEvent(roomId, "command:sent", cmd);
    } catch (err) {
      socket.emit("error", { message: `Device command failed: ${(err as Error).message}` });
    }
  });

  // Host chat
  socket.on("chat:message", (data) => {
    const msg = chatService.saveMessage(roomId, "Host", data.message);
    io.to(`room:${roomId}`).emit("chat:message", msg);
    dispatchEvent(roomId, "chat:message", { senderName: "Host", message: data.message });
  });

  // Host media signaling
  mediaSignaling.addParticipant(roomId, "host", socket.id, "Host");
  mediaSignaling.setupMediaSignaling(io, socket, roomId, "host");

  socket.on("disconnect", () => {
    logger.info(`[${roomId}] Host disconnected`);
    hostSockets.delete(roomId);
    mediaSignaling.removeParticipant(roomId, "host");
  });
}

function handleGuestConnection(io: IOServer, socket: IOSocket, roomId: string, token: string, name: string): void {
  const linkResult = validateShareLink(token);
  if (!linkResult || linkResult.room.id !== roomId) {
    socket.emit("error", { message: "Invalid share link" });
    socket.disconnect();
    return;
  }

  // Create pending guest
  const { guestId, code } = lobby.createPendingGuest(roomId, name, socket.id);

  logger.info(`[${roomId}] Guest "${name}" (${guestId}) connecting`);

  // If open mode, auto-approve and join immediately
  if (linkResult.room.accessMode === "open") {
    finalizeGuestJoin(io, socket, roomId, guestId, name);
  } else {
    // Challenge mode — track socket for host-approval flow
    guestSockets.set(guestId, { socket, roomId, name });

    // Notify host of pending guest
    const hostSocketId = hostSockets.get(roomId);
    if (hostSocketId) {
      io.to(hostSocketId).emit("lobby:pending", { guestId, name, code });
    }

    // Listen for code-based verification from the guest
    socket.on("guest:join", (data) => {
      if (data.code && lobby.verifyChallengeCode(guestId, data.code)) {
        lobby.approveGuest(guestId);
        finalizeGuestJoin(io, socket, roomId, guestId, name);
        dispatchEvent(roomId, "guest:approved", { guestId, name });
      }
    });
  }

  // Guest device commands — verify device is assigned to this room
  socket.on("device:command", async (cmd) => {
    // Check that the target device is assigned to this guest's room
    const roomDevices = await toyboxService.getDevicesForRoom(roomId);
    const deviceAllowed = roomDevices.some(
      (d) => d.id === cmd.deviceId || String(d.buttplugIndex) === cmd.deviceId
    );

    if (!deviceAllowed) {
      socket.emit("error", { message: "Device not assigned to this room" });
      return;
    }

    try {
      await toyboxService.sendDeviceCommand(cmd);
      dispatchEvent(roomId, "command:sent", { ...cmd, guestId, guestName: name });
    } catch (err) {
      socket.emit("error", { message: `Device command failed: ${(err as Error).message}` });
    }
  });

  // Guest chat
  socket.on("chat:message", (data) => {
    const msg = chatService.saveMessage(roomId, name, data.message);
    io.to(`room:${roomId}`).emit("chat:message", msg);
    dispatchEvent(roomId, "chat:message", { senderName: name, message: data.message });
  });

  socket.on("disconnect", () => {
    logger.info(`[${roomId}] Guest "${name}" (${guestId}) disconnected`);
    lobby.markGuestDisconnected(socket.id);
    mediaSignaling.removeParticipant(roomId, guestId);
    guestSockets.delete(guestId);
    io.to(`room:${roomId}`).emit("guest:left", { guestId });
    dispatchEvent(roomId, "guest:left", { guestId, name });
  });
}
