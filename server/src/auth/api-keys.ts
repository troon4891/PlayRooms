import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { ApiKeyScope } from "../types/index.js";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface CreateApiKeyResult {
  id: string;
  name: string;
  key: string; // full key — returned only once
  keyPrefix: string;
  scopes: ApiKeyScope[];
  expiresAt: number | null;
  createdAt: number;
}

export function createApiKey(
  userId: string,
  name: string,
  scopes: ApiKeyScope[],
  expiresAt?: number,
): CreateApiKeyResult {
  const key = `pk_${randomBytes(32).toString("hex")}`;
  const keyPrefix = key.slice(0, 11); // "pk_" + first 8 hex chars
  const now = Date.now();

  const record = {
    id: uuidv4(),
    userId,
    name,
    keyHash: hashKey(key),
    keyPrefix,
    scopes: JSON.stringify(scopes),
    lastUsedAt: null,
    expiresAt: expiresAt ?? null,
    createdAt: now,
  };

  db.insert(schema.apiKeys).values(record).run();

  return {
    id: record.id,
    name,
    key,
    keyPrefix,
    scopes,
    expiresAt: record.expiresAt,
    createdAt: now,
  };
}

export interface ValidatedApiKey {
  id: string;
  userId: string;
  scopes: ApiKeyScope[];
}

export function validateApiKey(key: string): ValidatedApiKey | null {
  if (!key.startsWith("pk_")) return null;

  const prefix = key.slice(0, 11);
  const candidates = db.select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyPrefix, prefix))
    .all();

  const incomingHash = hashKey(key);
  const incomingBuf = Buffer.from(incomingHash, "hex");

  for (const candidate of candidates) {
    const candidateBuf = Buffer.from(candidate.keyHash, "hex");
    if (incomingBuf.length === candidateBuf.length && timingSafeEqual(incomingBuf, candidateBuf)) {
      // Check expiry
      if (candidate.expiresAt && candidate.expiresAt < Date.now()) {
        return null;
      }

      // Update last used
      db.update(schema.apiKeys)
        .set({ lastUsedAt: Date.now() })
        .where(eq(schema.apiKeys.id, candidate.id))
        .run();

      return {
        id: candidate.id,
        userId: candidate.userId,
        scopes: JSON.parse(candidate.scopes) as ApiKeyScope[],
      };
    }
  }

  return null;
}

export function revokeApiKey(id: string, userId: string): boolean {
  const key = db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, id)).get();
  if (!key || key.userId !== userId) return false;

  db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id)).run();
  return true;
}

export function listApiKeys(userId: string) {
  return db.select({
    id: schema.apiKeys.id,
    name: schema.apiKeys.name,
    keyPrefix: schema.apiKeys.keyPrefix,
    scopes: schema.apiKeys.scopes,
    lastUsedAt: schema.apiKeys.lastUsedAt,
    expiresAt: schema.apiKeys.expiresAt,
    createdAt: schema.apiKeys.createdAt,
  })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId))
    .all()
    .map((k) => ({ ...k, scopes: JSON.parse(k.scopes) }));
}
