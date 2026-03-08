import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { hashPassword } from "./password.js";
import { login, getUserCount } from "./login.js";
import { verifyToken } from "./tokens.js";
import { rateLimiter } from "./rate-limiter.js";

export const authRouter = Router();

// Rate limit login: 5 attempts per minute
authRouter.use("/login", rateLimiter(60_000, 5, "auth-login"));

// POST /api/auth/setup — initial admin creation (only if no users exist)
authRouter.post("/setup", async (req, res) => {
  try {
    const count = getUserCount();
    if (count > 0) {
      res.status(409).json({ error: "Setup already completed. Users already exist." });
      return;
    }

    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }

    if (typeof username !== "string" || username.length < 3 || username.length > 50) {
      res.status(400).json({ error: "Username must be 3-50 characters" });
      return;
    }

    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = {
      id: uuidv4(),
      username,
      passwordHash,
      role: "admin" as const,
      lockedUntil: null,
      createdAt: Date.now(),
    };

    db.insert(schema.users).values(user).run();

    res.status(201).json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/auth/login — { username, password } → JWT
authRouter.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }

    const ip = req.ip ?? "unknown";
    const result = await login(username, password, ip);

    if (!result.success) {
      const status = result.lockedUntil ? 423 : 401;
      res.status(status).json({
        error: result.error,
        ...(result.lockedUntil && { lockedUntil: result.lockedUntil }),
      });
      return;
    }

    res.json({ token: result.token });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/auth/me — current user info from JWT
authRouter.get("/me", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = db.select().from(schema.users).where(eq(schema.users.id, payload.sub)).get();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
  });
});

// GET /api/auth/status — check if setup is needed
authRouter.get("/status", (_req, res) => {
  const count = getUserCount();
  res.json({ setupRequired: count === 0 });
});
