import { Router, Request, Response } from "express";
import { requireHost } from "../auth/middleware.js";
import {
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  testWebhook,
} from "./webhook.service.js";
import type { WebhookEvent } from "../types/index.js";

const VALID_EVENTS: WebhookEvent[] = [
  "guest:joined", "guest:left", "guest:approved", "guest:rejected",
  "device:connected", "device:disconnected", "device:assigned",
  "command:sent", "room:updated", "room:deleted", "chat:message",
];

export const webhookRouter = Router({ mergeParams: true });

// All webhook routes require host auth
webhookRouter.use(requireHost);

// GET /api/rooms/:roomId/webhooks
webhookRouter.get("/", (req: Request<{ roomId: string }>, res: Response) => {
  const hooks = listWebhooks(req.params.roomId);
  // Don't expose secrets in list view
  res.json(hooks.map((h) => ({ ...h, secret: undefined })));
});

// POST /api/rooms/:roomId/webhooks
webhookRouter.post("/", (req: Request<{ roomId: string }>, res: Response) => {
  const userId = req.user?.sub ?? req.apiKeyUserId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { url, events } = req.body;

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "URL is required" });
    return;
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      res.status(400).json({ error: "URL must use http or https" });
      return;
    }
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  if (!Array.isArray(events) || events.length === 0) {
    res.status(400).json({ error: "At least one event type is required" });
    return;
  }

  const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e as WebhookEvent));
  if (invalidEvents.length > 0) {
    res.status(400).json({ error: `Invalid events: ${invalidEvents.join(", ")}` });
    return;
  }

  const hook = createWebhook(req.params.roomId, userId, url, events as WebhookEvent[]);
  res.status(201).json(hook);
});

// PATCH /api/rooms/:roomId/webhooks/:id
webhookRouter.patch("/:id", (req: Request<{ roomId: string; id: string }>, res: Response) => {
  const hook = getWebhook(req.params.id);
  if (!hook || hook.roomId !== req.params.roomId) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  const { url, events, active } = req.body;
  const updates: { url?: string; events?: WebhookEvent[]; active?: boolean } = {};

  if (url !== undefined) {
    if (typeof url !== "string") {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        res.status(400).json({ error: "URL must use http or https" });
        return;
      }
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }
    updates.url = url;
  }

  if (events !== undefined) {
    if (!Array.isArray(events) || events.length === 0) {
      res.status(400).json({ error: "At least one event type is required" });
      return;
    }
    updates.events = events;
  }

  if (active !== undefined) {
    updates.active = !!active;
  }

  const updated = updateWebhook(req.params.id, updates);
  res.json(updated);
});

// DELETE /api/rooms/:roomId/webhooks/:id
webhookRouter.delete("/:id", (req: Request<{ roomId: string; id: string }>, res: Response) => {
  const hook = getWebhook(req.params.id);
  if (!hook || hook.roomId !== req.params.roomId) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  deleteWebhook(req.params.id);
  res.status(204).send();
});

// POST /api/rooms/:roomId/webhooks/:id/test
webhookRouter.post("/:id/test", (req: Request<{ roomId: string; id: string }>, res: Response) => {
  const hook = getWebhook(req.params.id);
  if (!hook || hook.roomId !== req.params.roomId) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  testWebhook(req.params.id);
  res.json({ status: "Test ping sent" });
});
