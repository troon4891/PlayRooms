import { db, schema } from "./index.js";
import { eq } from "drizzle-orm";

const DISCLAIMER_VERSION = "1.0.0";

export interface DisclaimerStatus {
  accepted: boolean;
  version: string | null;
  acceptedAt: number | null;
  updateAvailable: boolean;
}

export function getDisclaimerStatus(): DisclaimerStatus {
  const rows = db.select().from(schema.disclaimerAcceptance).all();
  const current = rows.find((r) => r.version === DISCLAIMER_VERSION);

  if (current) {
    return {
      accepted: true,
      version: current.version,
      acceptedAt: current.acceptedAt,
      updateAvailable: false,
    };
  }

  // Check if there's an older acceptance (terms updated)
  const hasOlder = rows.length > 0;
  return {
    accepted: false,
    version: null,
    acceptedAt: null,
    updateAvailable: hasOlder,
  };
}

export function acceptDisclaimer(): void {
  const now = Date.now();
  const existing = db.select().from(schema.disclaimerAcceptance)
    .where(eq(schema.disclaimerAcceptance.version, DISCLAIMER_VERSION))
    .all();

  if (existing.length === 0) {
    db.insert(schema.disclaimerAcceptance).values({
      id: `disclaimer_${DISCLAIMER_VERSION}`,
      version: DISCLAIMER_VERSION,
      acceptedAt: now,
    }).run();
  }
}

export function isDisclaimerAccepted(): boolean {
  return getDisclaimerStatus().accepted;
}
