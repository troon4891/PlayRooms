import { config } from "./config.js";
import { setLevel, createLogger } from "./logger.js";

setLevel(config.logLevel);

const logger = createLogger("PlayRooms");
const apiLogger = createLogger("API");

// --- Acceptance gate: refuse to start without accept_terms ---
if (!config.acceptTerms) {
  logger.error("PlayRooms cannot start: accept_terms must be set to true in addon configuration.");
  logger.error("By setting accept_terms to true, you accept the PlayRooms Terms of Use and Liability Disclaimer.");
  logger.error("See: https://github.com/troon4891/PlayRooms/blob/main/LICENSE");
  process.exit(1);
}

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

import { runMigrations } from "./db/migrate.js";
import { startEngine, stopEngine, restartEngine, isEngineRunning } from "./buttplug/engine.js";
import {
  connectClient,
  disconnectClient,
  startScanning,
  stopScanning,
  isConnected,
  isScanning,
  getDeviceStates,
  getDiscoveredDevices,
  refreshDeviceStates,
} from "./buttplug/client.js";
import { roomRouter } from "./rooms/room.routes.js";
import { setupRoomSockets } from "./rooms/room.socket.js";
import { requireHost } from "./auth/middleware.js";
import { createShareLink, validateShareLink, revokeShareLink, getLinksForRoom } from "./auth/share-links.js";
import { assignDeviceToRoom, unassignDevice, getDevicesForRoom } from "./widgets/toybox.service.js";
import { authRouter } from "./auth/auth.routes.js";
import { apiKeysRouter } from "./auth/api-keys.routes.js";
import { webhookRouter } from "./webhooks/webhook.routes.js";
import { rateLimiter } from "./auth/rate-limiter.js";
import { startCleanupInterval, stopCleanupInterval } from "./auth/cleanup.js";
import { dispatchEvent } from "./webhooks/webhook.service.js";
import {
  approveDevice,
  denyDevice,
  resetDevice,
  forgetDevice,
  getDeviceGlobalSettings,
  updateDeviceGlobalSettings,
  cleanupStaleDevices,
} from "./buttplug/device-approval.js";
import { getProtocols, setProtocolEnabled } from "./buttplug/protocol-filter.js";
import { loadPlugins } from "./plugins/loader.js";

import type { ServerToClientEvents, ClientToServerEvents, GuestType } from "./types/index.js";

// Relay client reference for health check (set during startup if portal is configured)
let relayClientRef: typeof import("./portal/relay-client.js") | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);

// CORS configuration — configurable for standalone mode
const corsOrigin = config.corsOrigins === "*" || config.corsOrigins === ""
  ? "*"
  : config.corsOrigins.split(",").map((s) => s.trim());

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"] },
});

// Middleware
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Serve static PWA files (index: false so index.html goes through ingress injection)
const publicDir = join(__dirname, "..", "public");
if (existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false }));
}

// --- Auth routes (standalone mode) ---
if (config.authMode === "standalone") {
  app.use("/api/auth", authRouter);
}

// --- Host API routes (require auth) ---
app.use("/api/rooms", requireHost, roomRouter);

// Mount webhook routes under rooms
app.use("/api/rooms/:roomId/webhooks", requireHost, webhookRouter);

// API key management
app.use("/api/keys", apiKeysRouter);

// --- Disclaimer acceptance API ---
app.get("/api/disclaimer/status", requireHost, async (_req, res) => {
  const { getDisclaimerStatus } = await import("./db/disclaimer.js");
  const status = getDisclaimerStatus();
  res.json(status);
});

app.post("/api/disclaimer/accept", requireHost, async (_req, res) => {
  const { acceptDisclaimer } = await import("./db/disclaimer.js");
  acceptDisclaimer();
  res.json({ status: "accepted" });
});

// --- Engine lifecycle API (Pillar 1) ---

app.post("/api/engine/start", requireHost, async (_req, res) => {
  try {
    if (isEngineRunning()) {
      // Engine already running, just ensure client is connected
      if (!isConnected()) {
        await connectClient();
      }
      res.json({ status: "already_running" });
      return;
    }
    await startEngine();
    await connectClient();
    res.json({ status: "started" });
  } catch (err) {
    apiLogger.error("Engine start failed:", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/engine/stop", requireHost, async (_req, res) => {
  try {
    await disconnectClient();
    stopEngine();
    res.json({ status: "stopped" });
  } catch (err) {
    apiLogger.error("Engine stop failed:", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/engine/status", requireHost, (_req, res) => {
  res.json({
    running: isEngineRunning(),
    clientConnected: isConnected(),
  });
});

// --- Device endpoints ---

app.get("/api/devices", requireHost, async (_req, res) => {
  // Returns only approved + connected devices (backward compatible)
  const states = await getDeviceStates();
  const { isDeviceApproved } = await import("./buttplug/device-approval.js");
  const approvedStates: typeof states = [];
  for (const state of states) {
    // Use device.name as stable identifier (matches handleDeviceAdded)
    if (await isDeviceApproved(state.name)) {
      approvedStates.push(state);
    }
  }
  res.json(approvedStates);
});

app.post("/api/devices/scan/start", requireHost, async (_req, res) => {
  try {
    await startScanning();
    res.json({ status: "scanning" });
  } catch (err) {
    apiLogger.error("Scan start failed:", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/devices/scan/stop", requireHost, async (_req, res) => {
  try {
    await stopScanning();
    res.json({ status: "stopped" });
  } catch (err) {
    apiLogger.error("Scan stop failed:", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/devices/:id/assign", requireHost, async (req, res) => {
  try {
    const result = await assignDeviceToRoom(
      parseInt(req.params.id),
      req.body.roomId,
      req.body.settings
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/devices/:id/unassign", requireHost, (req, res) => {
  try {
    unassignDevice(req.params.id);
    res.json({ status: "unassigned" });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/rooms/:id/devices", requireHost, async (req, res) => {
  try {
    const devices = await getDevicesForRoom(req.params.id);
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Device approval API (Pillar 2) ---

app.get("/api/devices/discovered", requireHost, async (_req, res) => {
  try {
    const discovered = await getDiscoveredDevices();
    res.json(discovered);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/devices/:id/approve", requireHost, async (req, res) => {
  try {
    await approveDevice(req.params.id);
    refreshDeviceStates();
    res.json({ status: "approved" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/devices/:id/deny", requireHost, async (req, res) => {
  try {
    await denyDevice(req.params.id);
    refreshDeviceStates();
    res.json({ status: "denied" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/devices/:id/reset", requireHost, async (req, res) => {
  try {
    await resetDevice(req.params.id);
    refreshDeviceStates();
    res.json({ status: "pending" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete("/api/devices/:id", requireHost, async (req, res) => {
  try {
    await forgetDevice(req.params.id);
    refreshDeviceStates();
    res.json({ status: "removed" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Device global settings ---

app.get("/api/devices/:id/settings", requireHost, async (req, res) => {
  try {
    const settings = await getDeviceGlobalSettings(req.params.id);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put("/api/devices/:id/settings", requireHost, async (req, res) => {
  try {
    const { maxIntensity, allowedCommands, displayName } = req.body;
    const update: Record<string, unknown> = {};
    if (typeof maxIntensity === "number") {
      update.maxIntensity = Math.max(0, Math.min(1, maxIntensity));
    }
    if (Array.isArray(allowedCommands)) {
      const valid = ["vibrate", "rotate", "linear", "stop"];
      update.allowedCommands = allowedCommands.filter((c: string) => valid.includes(c));
    }
    if (displayName !== undefined) {
      update.displayName = displayName || null;
    }
    await updateDeviceGlobalSettings(req.params.id, update);
    refreshDeviceStates();
    res.json({ status: "updated" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Engine restart ---

app.post("/api/engine/restart", requireHost, async (_req, res) => {
  try {
    await stopScanning();
    await disconnectClient();
    await restartEngine();
    // Wait for engine to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await connectClient();
    res.json({ status: "restarted" });
  } catch (err) {
    apiLogger.error("Engine restart failed:", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Scan status ---

app.get("/api/devices/scan/status", requireHost, (_req, res) => {
  res.json({
    scanning: isScanning(),
    scanTimeout: config.scanTimeout,
  });
});

// --- Protocol API (Pillar 3) ---

app.get("/api/protocols", requireHost, async (_req, res) => {
  try {
    const protocols = await getProtocols();
    res.json(protocols);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put("/api/protocols/:name", requireHost, async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    await setProtocolEnabled(req.params.name, enabled);
    res.json({ status: "updated" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Share link management
app.post("/api/rooms/:id/share", requireHost, (req, res) => {
  const expiresInMs = req.body.expiresInMs;
  const guestType = (req.body.guestType as GuestType) || "short";
  const link = createShareLink(req.params.id, expiresInMs, guestType);
  res.status(201).json(link);
});

app.get("/api/rooms/:id/share", requireHost, (req, res) => {
  const links = getLinksForRoom(req.params.id);
  res.json(links);
});

app.delete("/api/share/:token", requireHost, (req, res) => {
  revokeShareLink(req.params.token);
  res.status(204).send();
});

// --- Guest routes (public, rate-limited) ---
app.get("/api/join/:token", rateLimiter(60_000, 20, "share-validate"), (req, res) => {
  const result = validateShareLink(req.params.token);
  if (!result) {
    res.status(404).json({ error: "Invalid or expired share link" });
    return;
  }

  const room = result.room;
  res.json({
    id: room.id,
    name: room.name,
    accessMode: room.accessMode,
    challengeType: room.challengeType,
    maxGuests: room.maxGuests,
    widgets: JSON.parse(room.widgets).map((w: { type: string }) => w.type),
    guestType: result.link.guestType,
  });
});

// Portal info endpoint (used by client to construct portal share links)
app.get("/api/portal/info", requireHost, (_req, res) => {
  res.json({
    enabled: !!(config.portalUrl && config.portalSecret),
    url: config.portalUrl?.replace("ws://", "http://").replace("wss://", "https://") ?? null,
    instancePrefix: config.portalInstanceId.substring(0, 8),
  });
});

// Health check
app.get("/api/health", (_req, res) => {
  const result: Record<string, unknown> = {
    status: "ok",
    engine: isEngineRunning(),
    buttplug: isConnected(),
    version: "1.0.0",
    transports: config.transports,
    authMode: config.authMode,
  };

  if (config.portalUrl) {
    try {
      const relayClientModule = relayClientRef;
      result.portalConnected = relayClientModule?.isRelayConnected() ?? false;
    } catch {
      result.portalConnected = false;
    }
  }

  res.json(result);
});

// SPA fallback — serve index.html with HA ingress path injection
let indexHtml: string | null = null;

app.get("*", (req, res) => {
  const indexPath = join(publicDir, "index.html");
  if (!indexHtml) {
    if (!existsSync(indexPath)) {
      res.status(200).json({ message: "PlayRooms server running. Frontend not built yet." });
      return;
    }
    indexHtml = readFileSync(indexPath, "utf-8");
  }
  const ingressPath = (req.headers["x-ingress-path"] as string) || "";
  const baseHref = ingressPath ? ingressPath + "/" : "/";
  const html = indexHtml!
    .replace('<base href="/"', `<base href="${baseHref}"`)
    .replace('window.__INGRESS_PATH__ = ""', `window.__INGRESS_PATH__ = "${ingressPath}"`);
  res.type("html").send(html);
});

// Setup Socket.IO room handling
setupRoomSockets(io);

// --- Startup ---
async function start(): Promise<void> {
  logger.info(`Auth mode: ${config.authMode}`);
  logger.info("Running database migrations...");
  runMigrations();

  // Load plugins (device providers)
  logger.info("Loading plugins...");
  await loadPlugins();

  // Start periodic cleanup (expired tokens, challenge codes, inactive guests)
  startCleanupInterval();

  // Auto-remove stale blocked devices
  if (config.deviceStaleRemovalDays > 0) {
    await cleanupStaleDevices(config.deviceStaleRemovalDays);
  }

  // Only auto-start engine if scan_on_start is true
  // Otherwise, the host starts the engine manually from Settings.
  if (config.scanOnStart) {
    let engineRunning = false;
    logger.info("scan_on_start enabled — starting Intiface Engine...");
    try {
      await startEngine();
      logger.info("Intiface Engine started");
      engineRunning = true;
    } catch (err) {
      logger.warn("Intiface Engine failed to start:", (err as Error).message);
      logger.warn("Continuing without device support...");
    }

    if (engineRunning) {
      logger.info("Connecting Buttplug client...");
      try {
        await connectClient();
        logger.info("Buttplug client connected");
        await startScanning();
        logger.info("Auto-scan started");
      } catch (err) {
        logger.warn("Buttplug client connection failed:", (err as Error).message);
        logger.warn("Device features will be unavailable until connected");
      }
    }
  } else {
    logger.info("Engine will start when host clicks 'Start Engine' in Settings");
  }

  // Connect to portal relay if configured
  if (config.portalUrl && config.portalSecret) {
    logger.info(`Connecting to portal: ${config.portalUrl}`);
    try {
      const relayClientModule = await import("./portal/relay-client.js");
      relayClientRef = relayClientModule;
      await relayClientModule.connectToPortal(io);
      logger.info("Portal relay connected");

      // Setup relay bridge to dispatch relay events to services
      const { setupRelayBridge } = await import("./portal/relay-bridge.js");
      setupRelayBridge(io);
      logger.info("Relay bridge initialized");
    } catch (err) {
      logger.warn("Portal connection failed:", (err as Error).message);
      logger.warn("Continuing without portal relay...");
    }
  }

  server.listen(config.serverPort, () => {
    logger.info(`Server listening on port ${config.serverPort}`);
  });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  stopCleanupInterval();
  stopEngine();
  server.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("Interrupted, shutting down...");
  stopCleanupInterval();
  stopEngine();
  server.close();
  process.exit(0);
});

start().catch((err) => {
  logger.error("Fatal startup error:", err);
  process.exit(1);
});
