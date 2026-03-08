import { randomInt } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { eq, and, lt } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { GuestStatus } from "../types/index.js";

const CHALLENGE_CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function generateChallengeCode(): string {
  return String(randomInt(100000, 999999));
}

export function createPendingGuest(roomId: string, name: string, socketId: string): { guestId: string; code?: string } {
  const room = db.select().from(schema.playRooms).where(eq(schema.playRooms.id, roomId)).get();
  if (!room) throw new Error("Room not found");

  const guestId = uuidv4();
  const now = Date.now();

  db.insert(schema.roomGuests).values({
    id: guestId,
    roomId,
    name,
    status: room.accessMode === "open" ? "approved" : "pending",
    socketId,
    guestProfileId: null,
    joinedAt: now,
  }).run();

  let code: string | undefined;
  if (room.accessMode === "challenge" && room.challengeType === "code") {
    code = generateChallengeCode();
    // Persist challenge code to database (survives restart)
    db.insert(schema.challengeCodes).values({
      id: uuidv4(),
      guestId,
      roomId,
      code,
      expiresAt: now + CHALLENGE_CODE_EXPIRY_MS,
      createdAt: now,
    }).run();
  }

  return { guestId, code };
}

export function approveGuest(guestId: string): boolean {
  const guest = db.select().from(schema.roomGuests).where(eq(schema.roomGuests.id, guestId)).get();
  if (!guest || guest.status !== "pending") return false;

  db.update(schema.roomGuests)
    .set({ status: "approved" as GuestStatus })
    .where(eq(schema.roomGuests.id, guestId))
    .run();

  // Clean up any challenge codes for this guest
  db.delete(schema.challengeCodes)
    .where(eq(schema.challengeCodes.guestId, guestId))
    .run();

  return true;
}

export function rejectGuest(guestId: string): boolean {
  const guest = db.select().from(schema.roomGuests).where(eq(schema.roomGuests.id, guestId)).get();
  if (!guest) return false;

  db.delete(schema.roomGuests).where(eq(schema.roomGuests.id, guestId)).run();
  db.delete(schema.challengeCodes).where(eq(schema.challengeCodes.guestId, guestId)).run();
  return true;
}

export function markGuestJoined(guestId: string, socketId: string): void {
  db.update(schema.roomGuests)
    .set({ status: "joined" as GuestStatus, socketId })
    .where(eq(schema.roomGuests.id, guestId))
    .run();
}

export function markGuestDisconnected(socketId: string): string | null {
  const guest = db.select().from(schema.roomGuests).where(eq(schema.roomGuests.socketId, socketId)).get();
  if (!guest) return null;

  db.update(schema.roomGuests)
    .set({ status: "disconnected" as GuestStatus, socketId: null })
    .where(eq(schema.roomGuests.id, guest.id))
    .run();

  return guest.id;
}

export function linkGuestProfile(guestId: string, profileId: string): void {
  db.update(schema.roomGuests)
    .set({ guestProfileId: profileId })
    .where(eq(schema.roomGuests.id, guestId))
    .run();
}

export function verifyChallengeCode(guestId: string, code: string): boolean {
  const record = db.select()
    .from(schema.challengeCodes)
    .where(and(
      eq(schema.challengeCodes.guestId, guestId),
      eq(schema.challengeCodes.code, code),
    ))
    .get();

  if (!record) return false;

  // Check expiry
  if (record.expiresAt < Date.now()) {
    db.delete(schema.challengeCodes).where(eq(schema.challengeCodes.id, record.id)).run();
    return false;
  }

  return true;
}

export function getRoomGuests(roomId: string) {
  return db.select().from(schema.roomGuests)
    .where(eq(schema.roomGuests.roomId, roomId))
    .all()
    .filter((g) => g.status === "joined" || g.status === "approved");
}

export function cleanupExpiredChallengeCodes(): number {
  const now = Date.now();
  const expired = db.select()
    .from(schema.challengeCodes)
    .where(lt(schema.challengeCodes.expiresAt, now))
    .all();

  for (const code of expired) {
    db.delete(schema.challengeCodes).where(eq(schema.challengeCodes.id, code.id)).run();
  }

  return expired.length;
}
