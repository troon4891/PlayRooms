export type AccessMode = "open" | "challenge";
export type ChallengeType = "code" | "approval";
export type GuestStatus = "pending" | "approved" | "joined" | "disconnected";
export type WidgetType = "toybox" | "webcam" | "videochat" | "voicechat" | "textchat";
export type VoiceMode = "ptt" | "open";
export type UserRole = "admin" | "host";
export type GuestType = "short" | "long";
export type AuthMode = "ha-ingress" | "standalone";
export type ApiKeyScope = "rooms:read" | "rooms:write" | "devices:read" | "devices:write" | "guests:read" | "webhooks:manage";
export type WebhookEvent =
  | "guest:joined" | "guest:left" | "guest:approved" | "guest:rejected"
  | "device:connected" | "device:disconnected" | "device:assigned"
  | "command:sent" | "room:updated" | "room:deleted" | "chat:message";

export interface WidgetConfig {
  type: WidgetType;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface RoomPublicInfo {
  id: string;
  name: string;
  accessMode: AccessMode;
  challengeType: ChallengeType | null;
  maxGuests: number;
  currentGuests: number;
  widgets: WidgetType[];
}

export interface DeviceCapabilities {
  vibrate: boolean;
  rotate: boolean;
  linear: boolean;
  battery: boolean;
}

export interface DeviceGlobalSettings {
  maxIntensity: number;
  allowedCommands: string[];
  displayName: string | null;
}

export interface DeviceState {
  id: string;
  name: string;
  connected: boolean;
  batteryLevel: number | null;
  capabilities: DeviceCapabilities;
  globalSettings?: DeviceGlobalSettings;
}

export interface DeviceCommand {
  deviceId: string;
  command: "vibrate" | "rotate" | "linear" | "stop";
  value: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderName: string;
  message: string;
  createdAt: number;
}

export interface LobbyGuest {
  guestId: string;
  name: string;
  code?: string;
}

// Socket.IO event types
export interface ServerToClientEvents {
  "guest:approved": (data: { guestId: string }) => void;
  "guest:joined": (data: { guestId: string; name: string }) => void;
  "guest:left": (data: { guestId: string }) => void;
  "lobby:pending": (data: LobbyGuest) => void;
  "device:state": (data: DeviceState) => void;
  "chat:message": (data: ChatMessage) => void;
  "webrtc:offer": (data: { sdp: string; from: string; to: string }) => void;
  "webrtc:answer": (data: { sdp: string; from: string; to: string }) => void;
  "webrtc:ice": (data: { candidate: RTCIceCandidateInit; from: string; to: string }) => void;
  "voice:ptt-start": (data: { guestId: string }) => void;
  "voice:ptt-end": (data: { guestId: string }) => void;
  "room:state": (data: { guests: Array<{ id: string; name: string }>; devices: DeviceState[] }) => void;
  "error": (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  "guest:join": (data: { token: string; name: string; code?: string }) => void;
  "lobby:approve": (data: { guestId: string }) => void;
  "lobby:reject": (data: { guestId: string }) => void;
  "device:command": (data: DeviceCommand) => void;
  "chat:message": (data: { message: string }) => void;
  "webrtc:offer": (data: { sdp: string; to: string }) => void;
  "webrtc:answer": (data: { sdp: string; to: string }) => void;
  "webrtc:ice": (data: { candidate: RTCIceCandidateInit; to: string }) => void;
  "voice:ptt-start": () => void;
  "voice:ptt-end": () => void;
}

// --- Portal Relay Protocol Types ---

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
  roomInfo?: RoomPublicInfo & { guestType?: GuestType };
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