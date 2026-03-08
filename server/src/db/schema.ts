import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

// --- Existing tables (with modifications) ---

export const playRooms = sqliteTable("play_rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  accessMode: text("access_mode").notNull().default("open"),
  challengeType: text("challenge_type"),
  maxGuests: integer("max_guests").notNull().default(4),
  widgets: text("widgets").notNull().default("[]"),
  guestInactivityDays: integer("guest_inactivity_days").notNull().default(30),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => playRooms.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  active: integer("active").notNull().default(1),
  guestType: text("guest_type").notNull().default("short"), // 'short' | 'long'
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at").notNull(),
});

export const roomGuests = sqliteTable("room_guests", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => playRooms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  socketId: text("socket_id"),
  guestProfileId: text("guest_profile_id").references(() => guestProfiles.id, { onDelete: "set null" }),
  joinedAt: integer("joined_at").notNull(),
});

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  buttplugIndex: integer("buttplug_index").notNull(),
  name: text("name").notNull(),
  roomId: text("room_id").references(() => playRooms.id, { onDelete: "set null" }),
  settings: text("settings").notNull().default("{}"),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => playRooms.id, { onDelete: "cascade" }),
  senderName: text("sender_name").notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at").notNull(),
});

// --- New tables ---

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("host"), // 'admin' | 'host'
  lockedUntil: integer("locked_until"),
  createdAt: integer("created_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  ip: text("ip").notNull(),
  success: integer("success").notNull(), // 0 | 1
  createdAt: integer("created_at").notNull(),
});

export const guestProfiles = sqliteTable("guest_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"), // nullable — optional for returning guests
  persistent: integer("persistent").notNull().default(0), // 1 = never auto-expire
  lastActiveAt: integer("last_active_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const roomGuestAccess = sqliteTable("room_guest_access", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => playRooms.id, { onDelete: "cascade" }),
  guestProfileId: text("guest_profile_id").notNull().references(() => guestProfiles.id, { onDelete: "cascade" }),
  invitedAt: integer("invited_at").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(), // first 8 chars for identification
  scopes: text("scopes").notNull().default("[]"), // JSON array
  lastUsedAt: integer("last_used_at"),
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at").notNull(),
});

export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => playRooms.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  events: text("events").notNull().default("[]"), // JSON array of event types
  secret: text("secret").notNull(), // HMAC-SHA256 signing secret
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const challengeCodes = sqliteTable("challenge_codes", {
  id: text("id").primaryKey(),
  guestId: text("guest_id").notNull(),
  roomId: text("room_id").notNull(),
  code: text("code").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

// --- v3.1.0 tables ---

export const approvedDevices = sqliteTable("approved_devices", {
  id: text("id").primaryKey(),
  deviceName: text("device_name").notNull(),
  identifier: text("identifier").notNull().unique(),
  status: text("status").notNull().default("pending"), // 'approved' | 'denied' | 'pending'
  displayName: text("display_name"),
  globalSettings: text("global_settings").notNull().default("{}"),
  firstSeenAt: integer("first_seen_at").notNull(),
  lastSeenAt: integer("last_seen_at"),
  approvedAt: integer("approved_at"),
  updatedAt: integer("updated_at").notNull(),
});

export const allowedProtocols = sqliteTable("allowed_protocols", {
  id: text("id").primaryKey(),
  protocolName: text("protocol_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  enabled: integer("enabled").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});

// --- PlayRooms v1.0.0 tables ---

export const disclaimerAcceptance = sqliteTable("disclaimer_acceptance", {
  id: text("id").primaryKey(),
  version: text("version").notNull().unique(),
  acceptedAt: integer("accepted_at").notNull(),
});
