import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import type { AuthMode } from "./types/index.js";
import type { LogLevel } from "./logger.js";

export interface TransportConfig {
  bluetooth: boolean;
  serial: boolean;
  hid: boolean;
}

interface AppConfig {
  acceptTerms: boolean;         // must be true for the addon to start
  intifacePort: number;
  serverPort: number;
  scanOnStart: boolean;
  scanTimeout: number;          // scan auto-stop timeout in milliseconds
  deviceStaleRemovalDays: number; // auto-remove denied devices not seen in N days (0 = disabled)
  dataDir: string;
  transports: TransportConfig;
  authMode: AuthMode;
  jwtSecret: string;
  lockoutThreshold: number;
  lockoutDurationMs: number;
  logLevel: LogLevel;
  corsOrigins: string; // comma-separated or "*"
  // Portal configuration (Host connects outbound to Portal)
  portalUrl: string | null;     // URL of portal to connect to
  portalSecret: string | null;  // shared secret for relay auth
  portalInstanceId: string;     // unique ID for this HA instance
}

function parseBool(value: unknown, envFallback: string | undefined, defaultVal: boolean): boolean {
  if (value !== undefined && value !== null) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
  }
  if (envFallback !== undefined) return envFallback.toLowerCase() === "true";
  return defaultVal;
}

function getOrCreateJwtSecret(dataDir: string): string {
  // Allow explicit env override
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  // Persist a generated secret so it survives restarts
  const secretPath = join(dataDir, ".jwt-secret");
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, "utf-8").trim();
  }

  const secret = randomBytes(48).toString("hex");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

function getOrCreateInstanceId(dataDir: string): string {
  if (process.env.PORTAL_INSTANCE_ID) return process.env.PORTAL_INSTANCE_ID;

  const idPath = join(dataDir, ".portal-instance-id");
  if (existsSync(idPath)) {
    return readFileSync(idPath, "utf-8").trim();
  }

  const id = randomBytes(16).toString("hex");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(idPath, id, { mode: 0o600 });
  return id;
}

function loadConfig(): AppConfig {
  // Try reading HA add-on options first
  const optionsPath = "/data/options.json";
  let haOptions: Record<string, unknown> = {};
  const isHaMode = existsSync(optionsPath);

  if (isHaMode) {
    try {
      haOptions = JSON.parse(readFileSync(optionsPath, "utf-8"));
    } catch {
      // Fall back to env vars
    }
  }

  const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "data");

  // Auto-detect auth mode: HA ingress if options.json exists, standalone otherwise
  const authMode: AuthMode = (process.env.AUTH_MODE as AuthMode) ??
    (isHaMode ? "ha-ingress" : "standalone");

  const portalUrl = (haOptions.portal_url as string) || process.env.PORTAL_URL || null;
  const portalSecret = (haOptions.portal_secret as string) || process.env.PORTAL_SECRET || process.env.RELAY_SECRET || null;

  return {
    acceptTerms: parseBool(haOptions.accept_terms, process.env.ACCEPT_TERMS, false),
    intifacePort: Number(haOptions.intiface_port ?? process.env.INTIFACE_PORT ?? 12345),
    serverPort: Number(haOptions.server_port ?? process.env.SERVER_PORT ?? 8099),
    scanOnStart: parseBool(haOptions.scan_on_start, process.env.SCAN_ON_START, false),
    scanTimeout: Number(haOptions.scan_timeout ?? process.env.SCAN_TIMEOUT ?? 30000),
    deviceStaleRemovalDays: Number(haOptions.device_stale_days ?? process.env.DEVICE_STALE_DAYS ?? 90),
    dataDir,
    transports: {
      bluetooth: parseBool(haOptions.use_bluetooth, process.env.USE_BLUETOOTH, false),
      serial: parseBool(haOptions.use_serial, process.env.USE_SERIAL, false),
      hid: parseBool(haOptions.use_hid, process.env.USE_HID, false),
    },
    authMode,
    jwtSecret: getOrCreateJwtSecret(dataDir),
    lockoutThreshold: Number(process.env.LOCKOUT_THRESHOLD ?? 5),
    lockoutDurationMs: Number(process.env.LOCKOUT_DURATION_MS ?? 15 * 60 * 1000),
    logLevel: ((haOptions.log_level as string) ?? process.env.LOG_LEVEL ?? "info") as LogLevel,
    corsOrigins: process.env.CORS_ORIGINS ?? (authMode === "ha-ingress" ? "*" : ""),
    portalUrl,
    portalSecret,
    portalInstanceId: getOrCreateInstanceId(dataDir),
  };
}

export const config = loadConfig();
