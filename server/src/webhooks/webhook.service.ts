import { randomBytes, createHmac } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { WebhookEvent } from "../types/index.js";
import { createLogger } from "../logger.js";

const logger = createLogger("API");

export function createWebhook(
  roomId: string,
  userId: string,
  url: string,
  events: WebhookEvent[],
  secret?: string,
) {
  const now = Date.now();
  const record = {
    id: uuidv4(),
    roomId,
    userId,
    url,
    events: JSON.stringify(events),
    secret: secret ?? randomBytes(32).toString("hex"),
    active: 1,
    createdAt: now,
  };

  db.insert(schema.webhooks).values(record).run();
  return { ...record, events };
}

export function updateWebhook(id: string, updates: {
  url?: string;
  events?: WebhookEvent[];
  active?: boolean;
}) {
  const set: Record<string, unknown> = {};
  if (updates.url !== undefined) set.url = updates.url;
  if (updates.events !== undefined) set.events = JSON.stringify(updates.events);
  if (updates.active !== undefined) set.active = updates.active ? 1 : 0;

  db.update(schema.webhooks)
    .set(set)
    .where(eq(schema.webhooks.id, id))
    .run();

  return db.select().from(schema.webhooks).where(eq(schema.webhooks.id, id)).get();
}

export function deleteWebhook(id: string): boolean {
  const hook = db.select().from(schema.webhooks).where(eq(schema.webhooks.id, id)).get();
  if (!hook) return false;
  db.delete(schema.webhooks).where(eq(schema.webhooks.id, id)).run();
  return true;
}

export function getWebhook(id: string) {
  return db.select().from(schema.webhooks).where(eq(schema.webhooks.id, id)).get();
}

export function listWebhooks(roomId: string) {
  return db.select()
    .from(schema.webhooks)
    .where(eq(schema.webhooks.roomId, roomId))
    .all()
    .map((w) => ({ ...w, events: JSON.parse(w.events) as WebhookEvent[] }));
}

function signPayload(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

export function dispatchEvent(roomId: string, event: WebhookEvent, data: unknown): void {
  const hooks = db.select()
    .from(schema.webhooks)
    .where(and(eq(schema.webhooks.roomId, roomId), eq(schema.webhooks.active, 1)))
    .all();

  const payload = JSON.stringify({
    event,
    roomId,
    timestamp: Date.now(),
    data,
  });

  for (const hook of hooks) {
    const events = JSON.parse(hook.events) as string[];
    if (!events.includes(event)) continue;

    const signature = signPayload(payload, hook.secret);

    // Fire and forget — don't block on webhook delivery
    fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-256": signature,
        "X-Webhook-Id": hook.id,
      },
      body: payload,
      signal: AbortSignal.timeout(10000), // 10s timeout
    }).catch((err) => {
      logger.warn(`Webhook ${hook.id} delivery failed to ${hook.url}: ${(err as Error).message}`);
    });
  }
}

export function testWebhook(id: string): boolean {
  const hook = db.select().from(schema.webhooks).where(eq(schema.webhooks.id, id)).get();
  if (!hook) return false;

  const payload = JSON.stringify({
    event: "ping",
    roomId: hook.roomId,
    timestamp: Date.now(),
    data: { message: "Webhook test ping" },
  });

  const signature = signPayload(payload, hook.secret);

  fetch(hook.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature-256": signature,
      "X-Webhook-Id": hook.id,
    },
    body: payload,
    signal: AbortSignal.timeout(10000),
  }).catch((err) => {
    logger.warn(`Webhook ${hook.id} test ping failed to ${hook.url}: ${(err as Error).message}`);
  });

  return true;
}
