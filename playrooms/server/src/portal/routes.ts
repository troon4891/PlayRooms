import { Router } from "express";
import { nanoid } from "nanoid";
import * as registry from "./instance-registry.js";
import * as tokenCache from "./token-cache.js";
import * as guestBridge from "./guest-bridge.js";

export const portalRouter = Router();

/**
 * GET /api/join/:token
 * Proxies token validation to the HA instance via the relay channel.
 * The token is a compound token: {instancePrefix}_{originalToken}
 */
portalRouter.get("/api/join/:token", async (req, res) => {
  const compoundToken = req.params.token;

  // Check cache first
  const cached = tokenCache.getCachedValidation(compoundToken);
  if (cached) {
    if (cached.valid) {
      res.json(cached.roomInfo);
    } else {
      res.status(404).json({ error: cached.error || "Invalid or expired share link" });
    }
    return;
  }

  // Extract instance prefix
  const prefixSep = compoundToken.indexOf("_");
  let haSocket;
  let instanceId: string | null = null;

  if (prefixSep >= 4) {
    const prefix = compoundToken.substring(0, prefixSep);
    instanceId = registry.getInstanceIdByPrefix(prefix);
    if (instanceId) {
      haSocket = registry.getInstance(instanceId);
    }
  }

  // Fallback to default instance
  if (!haSocket) {
    const defaultInstance = registry.getDefaultInstance();
    if (defaultInstance) {
      haSocket = defaultInstance.socket;
      instanceId = defaultInstance.instanceId;
    }
  }

  if (!haSocket) {
    res.status(503).json({ error: "Host is offline" });
    return;
  }

  // Forward validation request to HA
  const requestId = nanoid();
  try {
    const promise = tokenCache.createValidationPromise(requestId);
    haSocket.emit("relay:validate:request", { requestId, token: compoundToken });
    const response = await promise;

    // Cache the result
    tokenCache.setCachedValidation(compoundToken, response);

    if (response.valid && response.roomInfo) {
      res.json(response.roomInfo);
    } else {
      res.status(404).json({ error: response.error || "Invalid or expired share link" });
    }
  } catch (err) {
    res.status(504).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/health
 * Portal health check with connected instance info.
 */
portalRouter.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    mode: "portal",
    version: "2.0.1",
    connectedInstances: registry.getConnectedInstanceCount(),
    connectedGuests: guestBridge.getGuestCount(),
  });
});

/**
 * GET /api/portal/info
 * Returns portal status information.
 */
portalRouter.get("/api/portal/info", (_req, res) => {
  res.json({
    enabled: true,
    mode: "portal",
    connectedInstances: registry.getConnectedInstanceCount(),
  });
});
