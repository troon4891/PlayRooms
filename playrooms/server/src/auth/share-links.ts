import { v4 as uuidv4 } from "uuid";
import { nanoid } from "nanoid";
import { eq, and, lt } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { config } from "../config.js";
import type { GuestType } from "../types/index.js";

export function createShareLink(roomId: string, expiresInMs?: number, guestType: GuestType = "short") {
  const now = Date.now();
  const originalToken = nanoid(21);
  const link = {
    id: uuidv4(),
    roomId,
    token: originalToken,
    active: 1,
    guestType,
    expiresAt: expiresInMs ? now + expiresInMs : null,
    createdAt: now,
  };

  db.insert(schema.shareLinks).values(link).run();

  // If portal is configured, include portal URL info in the response
  const portalUrl = config.portalUrl && config.portalSecret
    ? config.portalUrl.replace("ws://", "http://").replace("wss://", "https://")
    : null;
  const portalToken = portalUrl
    ? `${config.portalInstanceId.substring(0, 8)}_${originalToken}`
    : null;

  return {
    ...link,
    portalUrl,
    portalToken,
  };
}

export function validateShareLink(token: string) {
  const link = db
    .select()
    .from(schema.shareLinks)
    .where(and(eq(schema.shareLinks.token, token), eq(schema.shareLinks.active, 1)))
    .get();

  if (!link) return null;

  // Check expiry
  if (link.expiresAt && link.expiresAt < Date.now()) {
    revokeShareLink(token);
    return null;
  }

  // Get the room info
  const room = db
    .select()
    .from(schema.playRooms)
    .where(eq(schema.playRooms.id, link.roomId))
    .get();

  if (!room) return null;

  return { link, room };
}

export function revokeShareLink(token: string) {
  db.update(schema.shareLinks)
    .set({ active: 0 })
    .where(eq(schema.shareLinks.token, token))
    .run();
}

export function getLinksForRoom(roomId: string) {
  return db
    .select()
    .from(schema.shareLinks)
    .where(and(eq(schema.shareLinks.roomId, roomId), eq(schema.shareLinks.active, 1)))
    .all();
}

export function cleanupExpiredShareLinks(): number {
  const now = Date.now();
  const expired = db.select()
    .from(schema.shareLinks)
    .where(and(eq(schema.shareLinks.active, 1), lt(schema.shareLinks.expiresAt, now)))
    .all();

  for (const link of expired) {
    db.update(schema.shareLinks)
      .set({ active: 0 })
      .where(eq(schema.shareLinks.id, link.id))
      .run();
  }

  return expired.length;
}
