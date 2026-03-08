import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

/**
 * Maps protocol names to regex patterns that match device names reported by Intiface Engine.
 * Used for application-layer filtering — if a discovered device's name matches a disabled
 * protocol, it's silently ignored.
 */
const PROTOCOL_DEVICE_PATTERNS: Record<string, RegExp[]> = {
  lovense: [/^LVS-/i, /lovense/i],
  hismith: [/hismith/i, /^HS-/i],
  wevibe: [/we-vibe/i, /wevibe/i, /^WV-/i],
  "kiiroo-v2": [/kiiroo/i, /^KIIROO/i, /^OhMiBod/i],
  "kiiroo-v21": [/kiiroo/i, /^KIIROO/i],
  "magic-motion": [/magic.?motion/i, /^Flamingo/i],
  svakom: [/svakom/i],
  libo: [/libo/i],
  mysteryvibe: [/mysteryvibe/i, /^MV-/i, /^Crescendo/i, /^Tenuto/i],
  satisfyer: [/satisfyer/i, /^SF-/i],
  prettylove: [/pretty.?love/i],
  motorbunny: [/motorbunny/i],
  "vorze-sa": [/vorze/i],
  xinput: [/xinput/i, /^Xbox/i, /gamepad/i],
  "lelo-f1s": [/lelo/i, /^F1S/i, /^HUGO/i, /^IDA/i],
  aneros: [/aneros/i],
  zalo: [/zalo/i],
  "lovehoney-desire": [/lovehoney/i, /desire/i],
};

export interface ProtocolInfo {
  protocolName: string;
  displayName: string;
  enabled: boolean;
}

export async function getProtocols(): Promise<ProtocolInfo[]> {
  const rows = await db.select().from(schema.allowedProtocols);
  return rows.map((r) => ({
    protocolName: r.protocolName,
    displayName: r.displayName,
    enabled: r.enabled === 1,
  }));
}

export async function getEnabledProtocols(): Promise<string[]> {
  const rows = await db
    .select({ protocolName: schema.allowedProtocols.protocolName })
    .from(schema.allowedProtocols)
    .where(eq(schema.allowedProtocols.enabled, 1));
  return rows.map((r) => r.protocolName);
}

export async function setProtocolEnabled(protocolName: string, enabled: boolean): Promise<void> {
  await db
    .update(schema.allowedProtocols)
    .set({ enabled: enabled ? 1 : 0, updatedAt: Date.now() })
    .where(eq(schema.allowedProtocols.protocolName, protocolName));
}

/**
 * Check if a device name matches any enabled protocol.
 * Returns the matched protocol name, or null if no match / protocol disabled.
 * Devices that don't match ANY known pattern return "unknown" so they can still
 * be shown to the host for manual approval.
 */
export async function matchesEnabledProtocol(
  deviceName: string
): Promise<{ allowed: boolean; protocol: string | null }> {
  const enabledProtocols = await getEnabledProtocols();

  // Check against all known patterns
  for (const [protocol, patterns] of Object.entries(PROTOCOL_DEVICE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(deviceName)) {
        // Found a protocol match — is it enabled?
        if (enabledProtocols.includes(protocol)) {
          return { allowed: true, protocol };
        }
        // Known protocol but disabled
        return { allowed: false, protocol };
      }
    }
  }

  // No known protocol matched — allow through as "unknown" so host can see it
  return { allowed: true, protocol: "unknown" };
}
