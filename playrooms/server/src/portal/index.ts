import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

import { config } from "../config.js";
import { setupRelayNamespace } from "./relay-namespace.js";
import { setupGuestNamespace } from "./guest-namespace.js";
import { portalRouter } from "./routes.js";
import { createLogger } from "../logger.js";

const logger = createLogger("Portal");

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Starts the portal relay server.
 * This is a lightweight Express + Socket.IO server that:
 * - Accepts HA instance connections on /relay namespace
 * - Accepts guest connections on default namespace
 * - Serves the guest PWA static files
 * - Proxies token validation to HA via the relay channel
 *
 * No Intiface Engine, no SQLite, no device control.
 */
export async function startPortalServer(): Promise<void> {
  logger.info("Starting PlayRoom Portal server...");

  if (!config.portalSecret) {
    logger.error("FATAL: PORTAL_SECRET / RELAY_SECRET is required in portal mode");
    process.exit(1);
  }

  const app = express();
  const server = createServer(app);

  const corsOrigin = config.corsOrigins === "*" || config.corsOrigins === ""
    ? "*"
    : config.corsOrigins.split(",").map((s) => s.trim());

  const io = new Server(server, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e6, // 1MB max message size
  });

  // Middleware
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  // Portal API routes (health, token validation proxy)
  app.use(portalRouter);

  // Serve static PWA files
  const publicDir = join(__dirname, "..", "public");
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: false }));
  }

  // SPA fallback - serve index.html with portal mode flag
  let indexHtml: string | null = null;

  app.get("*", (_req, res) => {
    const indexPath = join(publicDir, "index.html");
    if (!indexHtml) {
      if (!existsSync(indexPath)) {
        res.status(200).json({ message: "PlayRoom Portal running. Frontend not built yet." });
        return;
      }
      indexHtml = readFileSync(indexPath, "utf-8");
    }
    const html = indexHtml!
      .replace('window.__INGRESS_PATH__ = ""', 'window.__INGRESS_PATH__ = ""')
      .replace("</head>", '<script>window.__PORTAL_MODE__ = true;</script></head>');
    res.type("html").send(html);
  });

  // Setup Socket.IO namespaces
  setupRelayNamespace(io);
  setupGuestNamespace(io);

  // Start listening
  server.listen(config.serverPort, () => {
    logger.info(`Portal server listening on port ${config.serverPort}`);
    logger.info("Waiting for HA instances to connect on /relay namespace...");
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("Shutting down...");
    server.close();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    logger.info("Interrupted, shutting down...");
    server.close();
    process.exit(0);
  });
}
