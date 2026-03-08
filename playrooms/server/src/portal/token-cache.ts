import type { RelayValidateResponse } from "../types/index.js";

interface PendingValidation {
  resolve: (value: RelayValidateResponse) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Maps requestId -> pending validation promise */
const pendingValidations = new Map<string, PendingValidation>();

/** Brief cache of successful validations (token -> response, 30s TTL) */
const validationCache = new Map<string, { response: RelayValidateResponse; expiresAt: number }>();

const CACHE_TTL_MS = 30_000;
const VALIDATION_TIMEOUT_MS = 10_000;

export function createValidationPromise(requestId: string): Promise<RelayValidateResponse> {
  return new Promise<RelayValidateResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingValidations.delete(requestId);
      reject(new Error("Token validation timed out — host may be offline"));
    }, VALIDATION_TIMEOUT_MS);

    pendingValidations.set(requestId, { resolve, reject, timeout });
  });
}

export function resolveValidation(requestId: string, response: RelayValidateResponse): void {
  const pending = pendingValidations.get(requestId);
  if (!pending) return;

  clearTimeout(pending.timeout);
  pendingValidations.delete(requestId);
  pending.resolve(response);
}

export function getCachedValidation(token: string): RelayValidateResponse | null {
  const entry = validationCache.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    validationCache.delete(token);
    return null;
  }
  return entry.response;
}

export function setCachedValidation(token: string, response: RelayValidateResponse): void {
  if (response.valid) {
    validationCache.set(token, {
      response,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }
}

export function invalidateCache(token: string): void {
  validationCache.delete(token);
}

// Cleanup stale cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of validationCache) {
    if (entry.expiresAt < now) {
      validationCache.delete(token);
    }
  }
}, 60_000);
