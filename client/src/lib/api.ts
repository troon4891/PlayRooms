import { apiBase } from "./ingress";
export { apiBase };

const BASE_URL = apiBase;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Rooms
export const rooms = {
  list: () => request<Room[]>("/rooms"),
  get: (id: string) => request<Room>(`/rooms/${id}`),
  create: (data: CreateRoomInput) => request<Room>("/rooms", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreateRoomInput>) => request<Room>(`/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/rooms/${id}`, { method: "DELETE" }),
};

// Share links
export const share = {
  create: (roomId: string, expiresInMs?: number) =>
    request<ShareLink>(`/rooms/${roomId}/share`, { method: "POST", body: JSON.stringify({ expiresInMs }) }),
  list: (roomId: string) => request<ShareLink[]>(`/rooms/${roomId}/share`),
  revoke: (token: string) => request<void>(`/share/${token}`, { method: "DELETE" }),
  validate: (token: string) => request<RoomPublicInfo>(`/join/${token}`),
};

// Engine lifecycle (Pillar 1)
export const engine = {
  start: () => request<{ status: string }>("/engine/start", { method: "POST" }),
  stop: () => request<{ status: string }>("/engine/stop", { method: "POST" }),
  restart: () => request<{ status: string }>("/engine/restart", { method: "POST" }),
  status: () => request<EngineStatus>("/engine/status"),
};

// Devices
export const devices = {
  list: () => request<DeviceState[]>("/devices"),
  startScan: () => request<{ status: string }>("/devices/scan/start", { method: "POST" }),
  stopScan: () => request<{ status: string }>("/devices/scan/stop", { method: "POST" }),
  assign: (id: string, roomId: string, settings?: Record<string, unknown>) =>
    request(`/devices/${id}/assign`, { method: "POST", body: JSON.stringify({ roomId, settings }) }),
  unassign: (id: string) =>
    request<{ status: string }>(`/devices/${id}/unassign`, { method: "POST" }),
  listForRoom: (roomId: string) =>
    request<RoomDevice[]>(`/rooms/${roomId}/devices`),
  // Device approval (Pillar 2)
  discovered: () => request<DiscoveredDevice[]>("/devices/discovered"),
  approve: (id: string) => request<{ status: string }>(`/devices/${id}/approve`, { method: "POST" }),
  deny: (id: string) => request<{ status: string }>(`/devices/${id}/deny`, { method: "POST" }),
  reset: (id: string) => request<{ status: string }>(`/devices/${id}/reset`, { method: "POST" }),
  forget: (id: string) => request<{ status: string }>(`/devices/${id}`, { method: "DELETE" }),
  // Global device settings
  getSettings: (id: string) => request<DeviceGlobalSettings>(`/devices/${id}/settings`),
  updateSettings: (id: string, settings: Partial<DeviceGlobalSettings>) =>
    request<{ status: string }>(`/devices/${id}/settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  // Scan status
  scanStatus: () => request<ScanStatus>("/devices/scan/status"),
};

// Protocols (Pillar 3)
export const protocols = {
  list: () => request<Protocol[]>("/protocols"),
  setEnabled: (name: string, enabled: boolean) =>
    request<{ status: string }>(`/protocols/${name}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
};

// Health
export const health = () =>
  request<HealthResponse>("/health");

// Types

export interface Room {
  id: string;
  name: string;
  accessMode: "open" | "challenge";
  challengeType: "code" | "approval" | null;
  maxGuests: number;
  widgets: WidgetConfig[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateRoomInput {
  name: string;
  accessMode: "open" | "challenge";
  challengeType?: "code" | "approval";
  maxGuests: number;
  widgets: WidgetConfig[];
}

export interface WidgetConfig {
  type: "toybox" | "webcam" | "videochat" | "voicechat" | "textchat";
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface ShareLink {
  id: string;
  roomId: string;
  token: string;
  active: number;
  expiresAt: number | null;
  createdAt: number;
  portalUrl?: string | null;
  portalToken?: string | null;
}

export interface RoomPublicInfo {
  id: string;
  name: string;
  accessMode: "open" | "challenge";
  challengeType: "code" | "approval" | null;
  maxGuests: number;
  widgets: string[];
}

export interface DeviceState {
  id: string;
  name: string;
  connected: boolean;
  batteryLevel: number | null;
  capabilities: {
    vibrate: boolean;
    rotate: boolean;
    linear: boolean;
    battery: boolean;
  };
  globalSettings?: DeviceGlobalSettings;
}

export interface EngineStatus {
  running: boolean;
  clientConnected: boolean;
}

export interface DiscoveredDevice {
  id: string;
  approvalId: string;
  name: string;
  identifier: string;
  status: "approved" | "denied" | "pending";
  connected: boolean;
  capabilities: {
    vibrate: boolean;
    rotate: boolean;
    linear: boolean;
    battery: boolean;
  };
  batteryLevel: number | null;
  globalSettings: DeviceGlobalSettings;
  protocol: string | null;
  lastSeenAt: number | null;
}

export interface DeviceGlobalSettings {
  maxIntensity: number;
  allowedCommands: string[];
  displayName: string | null;
}

export interface RoomDevice {
  id: string;
  buttplugIndex: number;
  name: string;
  roomId: string | null;
  settings: Record<string, unknown>;
  connected: boolean;
  capabilities: {
    vibrate: boolean;
    rotate: boolean;
    linear: boolean;
    battery: boolean;
  };
  batteryLevel: number | null;
  globalSettings?: DeviceGlobalSettings;
}

export interface ScanStatus {
  scanning: boolean;
  scanTimeout: number;
}

export interface Protocol {
  protocolName: string;
  displayName: string;
  enabled: boolean;
}

export interface HealthResponse {
  status: string;
  engine: boolean;
  buttplug: boolean;
  version: string;
  transports: {
    bluetooth: boolean;
    serial: boolean;
    hid: boolean;
  };
  authMode: string;
  portalConnected?: boolean;
}
