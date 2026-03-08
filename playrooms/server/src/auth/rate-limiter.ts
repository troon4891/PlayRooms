import type { Request, Response, NextFunction } from "express";

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, Map<string, WindowEntry>>();

export function rateLimiter(windowMs: number, maxRequests: number, keyPrefix = "global") {
  if (!windows.has(keyPrefix)) {
    windows.set(keyPrefix, new Map());
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const store = windows.get(keyPrefix)!;
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const cutoff = now - windowMs;

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= maxRequests) {
      const retryAfter = Math.ceil((entry.timestamps[0] + windowMs - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many requests, please try again later" });
      return;
    }

    entry.timestamps.push(now);
    next();
  };
}

// Periodic cleanup of stale entries (call from cleanup interval)
export function cleanupRateLimiterState(): void {
  const now = Date.now();
  for (const [, store] of windows) {
    for (const [key, entry] of store) {
      if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - 300000) {
        store.delete(key);
      }
    }
  }
}
