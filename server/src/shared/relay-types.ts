/**
 * PlayRooms Relay Protocol Types
 *
 * SOURCE OF TRUTH — This file is owned by the PlayRooms Host repository.
 * Changes start here, then get copied to PlayRooms-Portal.
 * Bump RELAY_PROTOCOL_VERSION when the protocol changes.
 */

export const RELAY_PROTOCOL_VERSION = 1;

/** Public room info shared via relay */
export interface RoomPublicInfo {
  id: string;
  name: string;
  accessMode: "open" | "challenge";
  challengeType: "code" | "approval" | null;
  maxGuests: number;
  currentGuests: number;
  widgets: string[];
}

/** Upstream envelope: guest event forwarded from Portal to HA */
export interface RelayUpstream {
  sourceGuestId: string;
  roomId: string;
  event: string;
  data: unknown;
}

/** Downstream envelope: HA event targeted at a specific guest on the Portal */
export interface RelayDownstream {
  targetGuestId: string;
  event: string;
  data: unknown;
}

/** Broadcast envelope: HA event broadcast to all guests in a room on the Portal */
export interface RelayBroadcast {
  roomId: string;
  event: string;
  data: unknown;
  excludeGuest?: string;
}

/** Sent by Portal when a guest connects and needs validation */
export interface RelayGuestConnect {
  guestId: string;
  roomId: string;
  token: string;
  name: string;
  code?: string;
}

/** Sent by Portal when a guest disconnects */
export interface RelayGuestDisconnect {
  guestId: string;
  roomId: string;
}

/** Token validation request from Portal to HA */
export interface RelayValidateRequest {
  requestId: string;
  token: string;
}

/** Token validation response from HA to Portal */
export interface RelayValidateResponse {
  requestId: string;
  valid: boolean;
  roomInfo?: RoomPublicInfo & { guestType?: "short" | "long" };
  error?: string;
}

/** HA status announcement */
export interface RelayHaStatus {
  status: "ready" | "shutting-down";
  rooms?: Array<{ id: string; name: string }>;
}

/** Portal notifies HA of currently connected guests on reconnect */
export interface RelayHaReconnected {
  guests: Array<{ guestId: string; roomId: string; name: string }>;
}

/** Allowed relay event names for the HA↔Portal channel */
export type RelayEventName =
  | "relay:guest:connect"
  | "relay:guest:disconnect"
  | "relay:upstream"
  | "relay:downstream"
  | "relay:downstream:room"
  | "relay:downstream:all"
  | "relay:validate:request"
  | "relay:validate:response"
  | "relay:guest:approved"
  | "relay:guest:rejected"
  | "relay:ha:status"
  | "relay:ha:reconnected"
  | "relay:ping"
  | "relay:pong";

/** Allowlisted guest events that Portal will relay upstream */
export const RELAY_ALLOWED_EVENTS: readonly string[] = [
  "device:command",
  "chat:message",
  "guest:join",
  "lobby:approve",
  "lobby:reject",
  "voice:ptt-start",
  "voice:ptt-end",
] as const;
