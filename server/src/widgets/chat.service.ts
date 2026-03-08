import { v4 as uuidv4 } from "uuid";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { ChatMessage } from "../types/index.js";
import { createLogger } from "../logger.js";

const logger = createLogger("Chat");

const MAX_MESSAGES_PER_ROOM = 500;

export function saveMessage(roomId: string, senderName: string, message: string): ChatMessage {
  const msg: ChatMessage = {
    id: uuidv4(),
    roomId,
    senderName,
    message: message.slice(0, 2000), // Limit message length
    createdAt: Date.now(),
  };

  db.insert(schema.chatMessages).values(msg).run();
  logger.debug(`[${roomId}] ${senderName}: ${message.slice(0, 50)}${message.length > 50 ? "..." : ""}`);

  return msg;
}

export function getRecentMessages(roomId: string, limit = 50): ChatMessage[] {
  const rows = db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.roomId, roomId))
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(limit)
    .all();

  // Return in chronological order
  return rows.reverse();
}

export function cleanupOldMessages(roomId: string): void {
  const messages = db
    .select({ id: schema.chatMessages.id })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.roomId, roomId))
    .orderBy(desc(schema.chatMessages.createdAt))
    .all();

  if (messages.length > MAX_MESSAGES_PER_ROOM) {
    const toDelete = messages.slice(MAX_MESSAGES_PER_ROOM);
    for (const msg of toDelete) {
      db.delete(schema.chatMessages).where(eq(schema.chatMessages.id, msg.id)).run();
    }
  }
}
