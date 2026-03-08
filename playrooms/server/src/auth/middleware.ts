import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { validateShareLink } from "./share-links.js";
import { verifyToken, type TokenPayload } from "./tokens.js";
import { validateApiKey as validateApiKeyService } from "./api-keys.js";
import type { ApiKeyScope } from "../types/index.js";
import { createLogger } from "../logger.js";

const logger = createLogger("Auth");

// Extend Express Request to carry auth info
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      shareLink?: ReturnType<typeof validateShareLink>;
      apiKeyUserId?: string;
    }
  }
}

// Extract bearer token or API key from request
function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}

function extractApiKey(req: Request): string | null {
  return (req.headers["x-api-key"] as string) ?? null;
}

// Host authentication — dual mode
export function requireHost(req: Request, res: Response, next: NextFunction): void {
  if (config.authMode === "ha-ingress") {
    // HA ingress sets X-Ingress-Path header for authenticated requests
    const ingressPath = req.headers["x-ingress-path"];
    const isLocal = req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "172.30.32.2";

    if (ingressPath || isLocal) {
      next();
      return;
    }

    logger.warn(`Host auth failed (ha-ingress): no ingress header, IP=${req.ip}`);
    res.status(401).json({ error: "Host authentication required" });
    return;
  }

  // Standalone mode: verify JWT or API key
  const jwt = extractBearerToken(req);
  if (jwt) {
    const payload = verifyToken(jwt);
    if (payload) {
      req.user = payload;
      next();
      return;
    }
  }

  const apiKey = extractApiKey(req);
  if (apiKey) {
    const result = validateApiKeyService(apiKey);
    if (result) {
      req.apiKeyUserId = result.userId;
      next();
      return;
    }
  }

  logger.warn(`Auth failed: no valid JWT or API key, IP=${req.ip}`);
  res.status(401).json({ error: "Authentication required" });
}

// Admin-only routes (standalone mode)
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (config.authMode === "ha-ingress") {
    // In HA mode, ingress implies admin access
    const ingressPath = req.headers["x-ingress-path"];
    const isLocal = req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "172.30.32.2";

    if (ingressPath || isLocal) {
      next();
      return;
    }
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  const jwt = extractBearerToken(req);
  if (jwt) {
    const payload = verifyToken(jwt);
    if (payload && payload.role === "admin") {
      req.user = payload;
      next();
      return;
    }
  }

  res.status(403).json({ error: "Admin access required" });
}

// API key auth with scope checking
export function requireApiKey(...requiredScopes: ApiKeyScope[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Also allow JWT auth
    const jwt = extractBearerToken(req);
    if (jwt) {
      const payload = verifyToken(jwt);
      if (payload) {
        req.user = payload;
        next();
        return;
      }
    }

    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res.status(401).json({ error: "API key required" });
      return;
    }

    const result = validateApiKeyService(apiKey);
    if (!result) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    // Check scopes
    if (requiredScopes.length > 0) {
      const keyScopes = result.scopes as string[];
      const hasScopes = requiredScopes.every((s) => keyScopes.includes(s));
      if (!hasScopes) {
        res.status(403).json({ error: "Insufficient API key scopes" });
        return;
      }
    }

    req.apiKeyUserId = result.userId;
    next();
  };
}

// Share token validation for guest routes
export function requireShareToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.params.token || req.query.token as string;

  if (!token) {
    res.status(401).json({ error: "Share token required" });
    return;
  }

  const result = validateShareLink(token);
  if (!result) {
    res.status(403).json({ error: "Invalid or expired share link" });
    return;
  }

  req.shareLink = result;
  next();
}
