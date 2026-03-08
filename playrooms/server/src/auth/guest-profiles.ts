import { v4 as uuidv4 } from "uuid";
import { eq, and, lt } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { hashPassword, verifyPassword } from "./password.js";

export function createGuestProfile(name: string, password?: string) {
  const now = Date.now();
  const id = uuidv4();

  const profile = {
    id,
    name,
    passwordHash: null as string | null,
    persistent: 0,
    lastActiveAt: now,
    createdAt: now,
  };

  // hashPassword is async, but we handle it synchronously via the caller
  db.insert(schema.guestProfiles).values(profile).run();
  return profile;
}

export async function createGuestProfileWithPassword(name: string, password: string) {
  const now = Date.now();
  const id = uuidv4();
  const passwordHash = await hashPassword(password);

  const profile = {
    id,
    name,
    passwordHash,
    persistent: 0,
    lastActiveAt: now,
    createdAt: now,
  };

  db.insert(schema.guestProfiles).values(profile).run();
  return profile;
}

export function grantRoomAccess(guestProfileId: string, roomId: string): void {
  // Check if access already exists
  const existing = db.select()
    .from(schema.roomGuestAccess)
    .where(and(
      eq(schema.roomGuestAccess.guestProfileId, guestProfileId),
      eq(schema.roomGuestAccess.roomId, roomId),
    ))
    .get();

  if (existing) return;

  db.insert(schema.roomGuestAccess).values({
    id: uuidv4(),
    roomId,
    guestProfileId,
    invitedAt: Date.now(),
  }).run();
}

export function findGuestProfileForRoom(name: string, roomId: string) {
  // Find a guest profile with this name that has access to this room
  const results = db.select()
    .from(schema.guestProfiles)
    .innerJoin(schema.roomGuestAccess, eq(schema.guestProfiles.id, schema.roomGuestAccess.guestProfileId))
    .where(and(
      eq(schema.guestProfiles.name, name),
      eq(schema.roomGuestAccess.roomId, roomId),
    ))
    .all();

  if (results.length === 0) return null;
  return results[0].guest_profiles;
}

export async function authenticateGuest(name: string, password: string, roomId: string): Promise<typeof schema.guestProfiles.$inferSelect | null> {
  const profile = findGuestProfileForRoom(name, roomId);
  if (!profile) return null;
  if (!profile.passwordHash) return null;

  const valid = await verifyPassword(password, profile.passwordHash);
  if (!valid) return null;

  touchActivity(profile.id);
  return profile;
}

export async function setGuestPassword(profileId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  db.update(schema.guestProfiles)
    .set({ passwordHash })
    .where(eq(schema.guestProfiles.id, profileId))
    .run();
}

export function updateGuestName(profileId: string, newName: string): void {
  db.update(schema.guestProfiles)
    .set({ name: newName })
    .where(eq(schema.guestProfiles.id, profileId))
    .run();
}

export function setPersistent(profileId: string, persistent: boolean): void {
  db.update(schema.guestProfiles)
    .set({ persistent: persistent ? 1 : 0 })
    .where(eq(schema.guestProfiles.id, profileId))
    .run();
}

export function touchActivity(profileId: string): void {
  db.update(schema.guestProfiles)
    .set({ lastActiveAt: Date.now() })
    .where(eq(schema.guestProfiles.id, profileId))
    .run();
}

export function getGuestProfile(id: string) {
  return db.select().from(schema.guestProfiles).where(eq(schema.guestProfiles.id, id)).get();
}

export function cleanupInactiveGuests(): number {
  // For each room, check its inactivity window and remove expired non-persistent profiles
  const rooms = db.select().from(schema.playRooms).all();
  let totalRemoved = 0;

  for (const room of rooms) {
    const cutoff = Date.now() - (room.guestInactivityDays * 86400000);

    // Find guest profiles with access to this room that are expired and non-persistent
    const expiredAccess = db.select()
      .from(schema.roomGuestAccess)
      .innerJoin(schema.guestProfiles, eq(schema.roomGuestAccess.guestProfileId, schema.guestProfiles.id))
      .where(and(
        eq(schema.roomGuestAccess.roomId, room.id),
        eq(schema.guestProfiles.persistent, 0),
        lt(schema.guestProfiles.lastActiveAt, cutoff),
      ))
      .all();

    for (const row of expiredAccess) {
      // Remove room access
      db.delete(schema.roomGuestAccess)
        .where(eq(schema.roomGuestAccess.id, row.room_guest_access.id))
        .run();

      // If guest has no other room access, remove the profile entirely
      const otherAccess = db.select()
        .from(schema.roomGuestAccess)
        .where(eq(schema.roomGuestAccess.guestProfileId, row.guest_profiles.id))
        .all();

      if (otherAccess.length === 0) {
        db.delete(schema.guestProfiles)
          .where(eq(schema.guestProfiles.id, row.guest_profiles.id))
          .run();
      }

      totalRemoved++;
    }
  }

  return totalRemoved;
}
