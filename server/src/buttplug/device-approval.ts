import { eq, and, lt } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, schema } from "../db/index.js";
import { createLogger } from "../logger.js";

const logger = createLogger("Device");

export type ApprovalStatus = "approved" | "denied" | "pending";

export interface DeviceGlobalSettings {
  maxIntensity: number;        // 0.0-1.0, default 1.0
  allowedCommands: string[];   // subset of ["vibrate", "rotate", "linear", "stop"]
  displayName: string | null;  // user-friendly name override
}

export const DEFAULT_GLOBAL_SETTINGS: DeviceGlobalSettings = {
  maxIntensity: 1.0,
  allowedCommands: ["vibrate", "rotate", "linear", "stop"],
  displayName: null,
};

export interface ApprovedDeviceRecord {
  id: string;
  deviceName: string;
  identifier: string;
  status: ApprovalStatus;
  displayName: string | null;
  globalSettings: string;
  firstSeenAt: number;
  lastSeenAt: number | null;
  approvedAt: number | null;
  updatedAt: number;
}

function generateId(): string {
  return randomBytes(12).toString("hex");
}

/**
 * Look up or create a device record when it's first discovered.
 * If the device was previously approved/denied, returns the existing status.
 * If new, inserts as 'pending'.
 */
export async function getOrCreateDevice(
  deviceName: string,
  identifier: string
): Promise<ApprovedDeviceRecord> {
  const existing = await db
    .select()
    .from(schema.approvedDevices)
    .where(eq(schema.approvedDevices.identifier, identifier))
    .limit(1);

  if (existing.length > 0) {
    return existing[0] as ApprovedDeviceRecord;
  }

  const now = Date.now();
  const record = {
    id: generateId(),
    deviceName,
    identifier,
    status: "pending" as const,
    displayName: null,
    globalSettings: JSON.stringify(DEFAULT_GLOBAL_SETTINGS),
    firstSeenAt: now,
    lastSeenAt: now,
    approvedAt: null,
    updatedAt: now,
  };

  await db.insert(schema.approvedDevices).values(record);

  return record;
}

export async function approveDevice(id: string): Promise<void> {
  const now = Date.now();
  await db
    .update(schema.approvedDevices)
    .set({ status: "approved", approvedAt: now, updatedAt: now })
    .where(eq(schema.approvedDevices.id, id));
}

export async function denyDevice(id: string): Promise<void> {
  await db
    .update(schema.approvedDevices)
    .set({ status: "denied", updatedAt: Date.now() })
    .where(eq(schema.approvedDevices.id, id));
}

export async function resetDevice(id: string): Promise<void> {
  await db
    .update(schema.approvedDevices)
    .set({ status: "pending", approvedAt: null, updatedAt: Date.now() })
    .where(eq(schema.approvedDevices.id, id));
}

export async function forgetDevice(id: string): Promise<void> {
  await db
    .delete(schema.approvedDevices)
    .where(eq(schema.approvedDevices.id, id));
}

export async function updateLastSeen(id: string): Promise<void> {
  await db
    .update(schema.approvedDevices)
    .set({ lastSeenAt: Date.now() })
    .where(eq(schema.approvedDevices.id, id));
}

export async function getDeviceByIdentifier(identifier: string): Promise<ApprovedDeviceRecord | null> {
  const rows = await db
    .select()
    .from(schema.approvedDevices)
    .where(eq(schema.approvedDevices.identifier, identifier))
    .limit(1);
  return rows.length > 0 ? (rows[0] as ApprovedDeviceRecord) : null;
}

export async function getDeviceGlobalSettings(id: string): Promise<DeviceGlobalSettings> {
  const row = await db
    .select({ globalSettings: schema.approvedDevices.globalSettings })
    .from(schema.approvedDevices)
    .where(eq(schema.approvedDevices.id, id))
    .limit(1);
  if (!row.length) return { ...DEFAULT_GLOBAL_SETTINGS };
  return { ...DEFAULT_GLOBAL_SETTINGS, ...JSON.parse(row[0].globalSettings) };
}

export async function updateDeviceGlobalSettings(
  id: string,
  settings: Partial<DeviceGlobalSettings>
): Promise<void> {
  const current = await getDeviceGlobalSettings(id);
  const merged = { ...current, ...settings };
  await db
    .update(schema.approvedDevices)
    .set({ globalSettings: JSON.stringify(merged), updatedAt: Date.now() })
    .where(eq(schema.approvedDevices.id, id));
}

export async function getApprovedDevices(): Promise<ApprovedDeviceRecord[]> {
  return (await db
    .select()
    .from(schema.approvedDevices)
    .where(eq(schema.approvedDevices.status, "approved"))) as ApprovedDeviceRecord[];
}

export async function getAllDeviceRecords(): Promise<ApprovedDeviceRecord[]> {
  return (await db.select().from(schema.approvedDevices)) as ApprovedDeviceRecord[];
}

export async function isDeviceApproved(identifier: string): Promise<boolean> {
  const rows = await db
    .select({ status: schema.approvedDevices.status })
    .from(schema.approvedDevices)
    .where(eq(schema.approvedDevices.identifier, identifier))
    .limit(1);
  return rows.length > 0 && rows[0].status === "approved";
}

/**
 * Auto-remove denied devices not seen in `maxAgeDays` days.
 * Only removes denied devices — approved ones are kept regardless.
 * Returns the number of removed records.
 */
export async function cleanupStaleDevices(maxAgeDays: number): Promise<number> {
  if (maxAgeDays <= 0) return 0; // disabled
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  // Find stale denied devices, then delete them
  const stale = await db
    .select({ id: schema.approvedDevices.id })
    .from(schema.approvedDevices)
    .where(
      and(
        eq(schema.approvedDevices.status, "denied"),
        lt(schema.approvedDevices.lastSeenAt, cutoff)
      )
    );

  if (stale.length === 0) return 0;

  for (const row of stale) {
    await db
      .delete(schema.approvedDevices)
      .where(eq(schema.approvedDevices.id, row.id));
  }

  logger.info(
    `Auto-removed ${stale.length} stale blocked device(s) not seen in ${maxAgeDays} days`
  );
  return stale.length;
}
