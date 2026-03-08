import { Router } from "express";
import { requireHost } from "./middleware.js";
import { createApiKey, revokeApiKey, listApiKeys } from "./api-keys.js";
import type { ApiKeyScope } from "../types/index.js";

const VALID_SCOPES: ApiKeyScope[] = [
  "rooms:read", "rooms:write", "devices:read", "devices:write", "guests:read", "webhooks:manage",
];

export const apiKeysRouter = Router();

// All API key routes require host auth
apiKeysRouter.use(requireHost);

// GET /api/keys — list user's API keys
apiKeysRouter.get("/", (req, res) => {
  const userId = req.user?.sub ?? req.apiKeyUserId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const keys = listApiKeys(userId);
  res.json(keys);
});

// POST /api/keys — create new key
apiKeysRouter.post("/", (req, res) => {
  const userId = req.user?.sub ?? req.apiKeyUserId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { name, scopes, expiresAt } = req.body;

  if (!name || typeof name !== "string" || name.length > 100) {
    res.status(400).json({ error: "Name is required (max 100 characters)" });
    return;
  }

  if (!Array.isArray(scopes) || scopes.length === 0) {
    res.status(400).json({ error: "At least one scope is required" });
    return;
  }

  const invalidScopes = scopes.filter((s: string) => !VALID_SCOPES.includes(s as ApiKeyScope));
  if (invalidScopes.length > 0) {
    res.status(400).json({ error: `Invalid scopes: ${invalidScopes.join(", ")}` });
    return;
  }

  const result = createApiKey(userId, name, scopes as ApiKeyScope[], expiresAt);
  res.status(201).json(result);
});

// DELETE /api/keys/:id — revoke key
apiKeysRouter.delete("/:id", (req, res) => {
  const userId = req.user?.sub ?? req.apiKeyUserId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const revoked = revokeApiKey(req.params.id, userId);
  if (!revoked) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  res.status(204).send();
});
