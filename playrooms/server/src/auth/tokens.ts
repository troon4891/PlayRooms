import { createHmac } from "crypto";
import { config } from "../config.js";

export interface TokenPayload {
  sub: string;
  role: "admin" | "host";
  iat: number;
  exp: number;
}

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function sign(header: string, payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
}

export function signToken(userId: string, role: "admin" | "host"): string {
  const now = Date.now();
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      role,
      iat: Math.floor(now / 1000),
      exp: Math.floor((now + TOKEN_EXPIRY_MS) / 1000),
    })
  );
  const signature = sign(header, payload, config.jwtSecret);
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSignature = sign(header, payload, config.jwtSecret);

  // Constant-time comparison via string matching of base64url
  if (signature.length !== expectedSignature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as TokenPayload;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}
