import { v4 as uuidv4 } from "uuid";
import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { config } from "../config.js";
import { verifyPassword } from "./password.js";
import { signToken } from "./tokens.js";

export interface LoginResult {
  success: boolean;
  token?: string;
  error?: string;
  lockedUntil?: number;
}

export async function login(username: string, password: string, ip: string): Promise<LoginResult> {
  const user = db.select().from(schema.users).where(eq(schema.users.username, username)).get();

  if (!user) {
    // Record failed attempt with no userId (unknown username)
    recordAttempt(null, ip, false);
    return { success: false, error: "Invalid credentials" };
  }

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    return { success: false, error: "Account locked", lockedUntil: user.lockedUntil };
  }

  // Clear expired lockout
  if (user.lockedUntil && user.lockedUntil <= Date.now()) {
    db.update(schema.users)
      .set({ lockedUntil: null })
      .where(eq(schema.users.id, user.id))
      .run();
  }

  const valid = await verifyPassword(password, user.passwordHash);
  recordAttempt(user.id, ip, valid);

  if (!valid) {
    // Check if we need to lock the account
    const recentFailures = db.select()
      .from(schema.loginAttempts)
      .where(and(
        eq(schema.loginAttempts.userId, user.id),
        eq(schema.loginAttempts.success, 0),
      ))
      .orderBy(desc(schema.loginAttempts.createdAt))
      .limit(config.lockoutThreshold)
      .all();

    if (recentFailures.length >= config.lockoutThreshold) {
      // Check that all N most recent are failures (no success in between)
      const allFailed = recentFailures.every((a) => a.success === 0);
      if (allFailed) {
        const lockedUntil = Date.now() + config.lockoutDurationMs;
        db.update(schema.users)
          .set({ lockedUntil })
          .where(eq(schema.users.id, user.id))
          .run();
        return { success: false, error: "Account locked", lockedUntil };
      }
    }

    return { success: false, error: "Invalid credentials" };
  }

  // Successful login — clear any lockout
  if (user.lockedUntil) {
    db.update(schema.users)
      .set({ lockedUntil: null })
      .where(eq(schema.users.id, user.id))
      .run();
  }

  const token = signToken(user.id, user.role as "admin" | "host");
  return { success: true, token };
}

function recordAttempt(userId: string | null, ip: string, success: boolean): void {
  db.insert(schema.loginAttempts).values({
    id: uuidv4(),
    userId,
    ip,
    success: success ? 1 : 0,
    createdAt: Date.now(),
  }).run();
}

export function getUserCount(): number {
  const result = db.select().from(schema.users).all();
  return result.length;
}
