import type { Socket } from "socket.io";

interface GuestEntry {
  guestId: string;
  socket: Socket;
  instanceId: string;
  roomId: string;
  name: string;
  approved: boolean;
  connectedAt: number;
}

/** Maps guestId -> GuestEntry */
const guests = new Map<string, GuestEntry>();

/** Maps roomId -> Set<guestId> for room broadcasts */
const roomGuests = new Map<string, Set<string>>();

/** Maps instanceId -> Set<guestId> for instance-level operations */
const instanceGuests = new Map<string, Set<string>>();

export function registerGuest(
  guestId: string,
  socket: Socket,
  instanceId: string,
  roomId: string,
  name: string,
): void {
  guests.set(guestId, {
    guestId,
    socket,
    instanceId,
    roomId,
    name,
    approved: false,
    connectedAt: Date.now(),
  });

  // Add to room index
  if (!roomGuests.has(roomId)) {
    roomGuests.set(roomId, new Set());
  }
  roomGuests.get(roomId)!.add(guestId);

  // Add to instance index
  if (!instanceGuests.has(instanceId)) {
    instanceGuests.set(instanceId, new Set());
  }
  instanceGuests.get(instanceId)!.add(guestId);
}

export function removeGuest(guestId: string): GuestEntry | null {
  const guest = guests.get(guestId);
  if (!guest) return null;

  guests.delete(guestId);

  // Remove from room index
  const roomSet = roomGuests.get(guest.roomId);
  if (roomSet) {
    roomSet.delete(guestId);
    if (roomSet.size === 0) roomGuests.delete(guest.roomId);
  }

  // Remove from instance index
  const instanceSet = instanceGuests.get(guest.instanceId);
  if (instanceSet) {
    instanceSet.delete(guestId);
    if (instanceSet.size === 0) instanceGuests.delete(guest.instanceId);
  }

  return guest;
}

export function getGuestSocket(guestId: string): Socket | null {
  return guests.get(guestId)?.socket ?? null;
}

export function getGuestEntry(guestId: string): GuestEntry | null {
  return guests.get(guestId) ?? null;
}

export function getGuestsInRoom(roomId: string): GuestEntry[] {
  const guestIds = roomGuests.get(roomId);
  if (!guestIds) return [];
  return Array.from(guestIds)
    .map((id) => guests.get(id))
    .filter((g): g is GuestEntry => g !== undefined);
}

export function getGuestsForInstance(instanceId: string): GuestEntry[] {
  const guestIds = instanceGuests.get(instanceId);
  if (!guestIds) return [];
  return Array.from(guestIds)
    .map((id) => guests.get(id))
    .filter((g): g is GuestEntry => g !== undefined);
}

export function markApproved(guestId: string): void {
  const guest = guests.get(guestId);
  if (guest) guest.approved = true;
}

export function removeAllForInstance(instanceId: string): void {
  const guestIds = instanceGuests.get(instanceId);
  if (!guestIds) return;

  for (const guestId of guestIds) {
    const guest = guests.get(guestId);
    if (guest) {
      guests.delete(guestId);
      const roomSet = roomGuests.get(guest.roomId);
      if (roomSet) {
        roomSet.delete(guestId);
        if (roomSet.size === 0) roomGuests.delete(guest.roomId);
      }
    }
  }

  instanceGuests.delete(instanceId);
}

export function getGuestCount(): number {
  return guests.size;
}
