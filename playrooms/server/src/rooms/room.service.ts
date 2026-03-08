import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { AccessMode, ChallengeType, WidgetConfig } from "../types/index.js";

export interface CreateRoomInput {
  name: string;
  accessMode: AccessMode;
  challengeType?: ChallengeType;
  maxGuests: number;
  widgets: WidgetConfig[];
  guestInactivityDays?: number;
}

export interface UpdateRoomInput {
  name?: string;
  accessMode?: AccessMode;
  challengeType?: ChallengeType | null;
  maxGuests?: number;
  widgets?: WidgetConfig[];
  guestInactivityDays?: number;
}

export function listRooms() {
  return db.select().from(schema.playRooms).all();
}

export function getRoom(id: string) {
  return db.select().from(schema.playRooms).where(eq(schema.playRooms.id, id)).get();
}

export function createRoom(input: CreateRoomInput) {
  const now = Date.now();
  const room = {
    id: uuidv4(),
    name: input.name,
    accessMode: input.accessMode,
    challengeType: input.challengeType ?? null,
    maxGuests: Math.min(4, Math.max(1, input.maxGuests)),
    widgets: JSON.stringify(input.widgets),
    guestInactivityDays: input.guestInactivityDays ?? 30,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(schema.playRooms).values(room).run();
  return room;
}

export function updateRoom(id: string, input: UpdateRoomInput) {
  const existing = getRoom(id);
  if (!existing) return null;

  const updates: Record<string, unknown> = { updatedAt: Date.now() };

  if (input.name !== undefined) updates.name = input.name;
  if (input.accessMode !== undefined) updates.accessMode = input.accessMode;
  if (input.challengeType !== undefined) updates.challengeType = input.challengeType;
  if (input.maxGuests !== undefined) updates.maxGuests = Math.min(4, Math.max(1, input.maxGuests));
  if (input.widgets !== undefined) updates.widgets = JSON.stringify(input.widgets);
  if (input.guestInactivityDays !== undefined) updates.guestInactivityDays = input.guestInactivityDays;

  db.update(schema.playRooms).set(updates).where(eq(schema.playRooms.id, id)).run();
  return getRoom(id);
}

export function deleteRoom(id: string) {
  const existing = getRoom(id);
  if (!existing) return false;
  db.delete(schema.playRooms).where(eq(schema.playRooms.id, id)).run();
  return true;
}
