import type { Server, Socket } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "../types/index.js";

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Track which sockets are in which rooms for WebRTC mesh
const roomParticipants = new Map<string, Map<string, { socketId: string; name: string }>>();

export function getParticipants(roomId: string): Array<{ id: string; name: string; socketId: string }> {
  const participants = roomParticipants.get(roomId);
  if (!participants) return [];
  return Array.from(participants.entries()).map(([id, p]) => ({
    id,
    name: p.name,
    socketId: p.socketId,
  }));
}

export function addParticipant(roomId: string, participantId: string, socketId: string, name: string): void {
  if (!roomParticipants.has(roomId)) {
    roomParticipants.set(roomId, new Map());
  }
  roomParticipants.get(roomId)!.set(participantId, { socketId, name });
}

export function removeParticipant(roomId: string, participantId: string): void {
  const participants = roomParticipants.get(roomId);
  if (participants) {
    participants.delete(participantId);
    if (participants.size === 0) {
      roomParticipants.delete(roomId);
    }
  }
}

export function removeParticipantBySocket(socketId: string): { roomId: string; participantId: string } | null {
  for (const [roomId, participants] of roomParticipants) {
    for (const [id, p] of participants) {
      if (p.socketId === socketId) {
        participants.delete(id);
        if (participants.size === 0) {
          roomParticipants.delete(roomId);
        }
        return { roomId, participantId: id };
      }
    }
  }
  return null;
}

export function setupMediaSignaling(io: IOServer, socket: IOSocket, roomId: string, participantId: string): void {
  // Relay WebRTC offers
  socket.on("webrtc:offer", (data) => {
    const participants = roomParticipants.get(roomId);
    if (!participants) return;
    const target = Array.from(participants.entries()).find(([id]) => id === data.to);
    if (target) {
      io.to(target[1].socketId).emit("webrtc:offer", {
        sdp: data.sdp,
        from: participantId,
        to: data.to,
      });
    }
  });

  // Relay WebRTC answers
  socket.on("webrtc:answer", (data) => {
    const participants = roomParticipants.get(roomId);
    if (!participants) return;
    const target = Array.from(participants.entries()).find(([id]) => id === data.to);
    if (target) {
      io.to(target[1].socketId).emit("webrtc:answer", {
        sdp: data.sdp,
        from: participantId,
        to: data.to,
      });
    }
  });

  // Relay ICE candidates
  socket.on("webrtc:ice", (data) => {
    const participants = roomParticipants.get(roomId);
    if (!participants) return;
    const target = Array.from(participants.entries()).find(([id]) => id === data.to);
    if (target) {
      io.to(target[1].socketId).emit("webrtc:ice", {
        candidate: data.candidate,
        from: participantId,
        to: data.to,
      });
    }
  });

  // Voice chat PTT
  socket.on("voice:ptt-start", () => {
    socket.to(`room:${roomId}`).emit("voice:ptt-start", { guestId: participantId });
  });

  socket.on("voice:ptt-end", () => {
    socket.to(`room:${roomId}`).emit("voice:ptt-end", { guestId: participantId });
  });
}
