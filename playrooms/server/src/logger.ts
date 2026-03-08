export type LogLevel = "debug" | "info" | "warn" | "error";
export type Subsystem = "Engine" | "Room" | "Chat" | "Device" | "ToyBox"
               | "WebRTC" | "Auth" | "API" | "Portal" | "PlayRooms" | "DB";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let minLevel: number = LEVELS.info;

export function setLevel(level: LogLevel): void {
  minLevel = LEVELS[level];
}

function log(level: LogLevel, subsystem: Subsystem, message: string, ...args: unknown[]): void {
  if (LEVELS[level] < minLevel) return;
  const timestamp = new Date().toISOString();
  const prefix = `${timestamp} [${level.toUpperCase()}] [${subsystem}]`;
  const fn = level === "error" ? console.error
           : level === "warn" ? console.warn
           : console.log;
  fn(`${prefix} ${message}`, ...args);
}

export function createLogger(subsystem: Subsystem) {
  return {
    debug: (msg: string, ...a: unknown[]) => log("debug", subsystem, msg, ...a),
    info:  (msg: string, ...a: unknown[]) => log("info",  subsystem, msg, ...a),
    warn:  (msg: string, ...a: unknown[]) => log("warn",  subsystem, msg, ...a),
    error: (msg: string, ...a: unknown[]) => log("error", subsystem, msg, ...a),
  };
}
