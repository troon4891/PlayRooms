import { ButtplugClient, ButtplugNodeWebsocketClientConnector, ButtplugClientDevice } from "buttplug";
import { config } from "../config.js";
import { matchesEnabledProtocol } from "./protocol-filter.js";
import { getOrCreateDevice, isDeviceApproved, denyDevice, updateLastSeen, getDeviceByIdentifier } from "./device-approval.js";
import type { DeviceState, DeviceCapabilities, DeviceCommand } from "../types/index.js";
import { createLogger } from "../logger.js";

const logger = createLogger("Device");

let client: ButtplugClient | null = null;
let deviceListeners: Array<(devices: DeviceState[]) => void> = [];
let discoveredListeners: Array<() => void> = [];
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let scanning = false;

// Track all discovered devices with their buttplug index → identifier mapping
const discoveredDeviceMap = new Map<number, { name: string; identifier: string }>();

export function onDevicesChanged(listener: (devices: DeviceState[]) => void): () => void {
  deviceListeners.push(listener);
  return () => {
    deviceListeners = deviceListeners.filter((l) => l !== listener);
  };
}

export function onDiscoveredChanged(listener: () => void): () => void {
  discoveredListeners.push(listener);
  return () => {
    discoveredListeners = discoveredListeners.filter((l) => l !== listener);
  };
}

function notifyDeviceListeners(): void {
  getDeviceStates().then((states) => {
    for (const listener of deviceListeners) {
      listener(states);
    }
  });
}

function notifyDiscoveredListeners(): void {
  for (const listener of discoveredListeners) {
    listener();
  }
}

function mapCapabilities(device: ButtplugClientDevice): DeviceCapabilities {
  const msgAttrs = device.messageAttributes;
  return {
    vibrate: msgAttrs.ScalarCmd?.some((a) => a.ActuatorType === "Vibrate") ?? false,
    rotate: msgAttrs.RotateCmd !== undefined,
    linear: msgAttrs.LinearCmd !== undefined,
    battery: msgAttrs.SensorReadCmd?.some((a) => a.SensorType === "Battery") ?? false,
  };
}

async function deviceToState(device: ButtplugClientDevice): Promise<DeviceState> {
  const identifier = device.name;
  const record = await getDeviceByIdentifier(identifier);
  const globalSettings = record
    ? JSON.parse(record.globalSettings || "{}")
    : undefined;

  return {
    id: String(device.index),
    name: globalSettings?.displayName || device.name,
    connected: true,
    batteryLevel: null,
    capabilities: mapCapabilities(device),
    globalSettings,
  };
}

/**
 * Returns only approved + connected devices (backward compatible).
 * Used by ToyBox, room assignment, etc.
 */
export async function getDeviceStates(): Promise<DeviceState[]> {
  if (!client) return [];
  const approvedStates: DeviceState[] = [];
  for (const device of client.devices) {
    const entry = discoveredDeviceMap.get(device.index);
    if (entry) {
      approvedStates.push(await deviceToState(device));
    }
  }
  return approvedStates;
}

/**
 * Returns all discovered device info with their approval status and connection state.
 * Used by the Settings UI to show pending/approved/denied devices.
 */
export async function getDiscoveredDevices(): Promise<
  Array<{
    id: string;
    approvalId: string;
    name: string;
    identifier: string;
    status: string;
    connected: boolean;
    capabilities: DeviceCapabilities;
    batteryLevel: number | null;
    globalSettings: Record<string, unknown>;
    protocol: string | null;
    lastSeenAt: number | null;
  }>
> {
  const { getAllDeviceRecords } = await import("./device-approval.js");
  const records = await getAllDeviceRecords();

  return await Promise.all(records.map(async (record) => {
    // Find the live buttplug device if connected (match by name directly)
    const liveDevice = client?.devices.find(
      (d) => d.name === record.identifier
    );

    // Determine protocol from device name
    const protocolResult = await matchesEnabledProtocol(record.deviceName);

    return {
      id: record.id,
      approvalId: record.id,
      name: record.displayName || record.deviceName,
      identifier: record.identifier,
      status: record.status,
      connected: !!liveDevice,
      capabilities: liveDevice
        ? mapCapabilities(liveDevice)
        : { vibrate: false, rotate: false, linear: false, battery: false },
      batteryLevel: null,
      globalSettings: JSON.parse(record.globalSettings || "{}"),
      protocol: protocolResult.protocol,
      lastSeenAt: record.lastSeenAt ?? null,
    };
  }));
}

async function handleDeviceAdded(device: ButtplugClientDevice): Promise<void> {
  // Use device.name as stable identifier (index changes across sessions)
  const identifier = device.name;

  // Step 1: Protocol filter — is this device's brand/protocol allowed?
  const protocolResult = await matchesEnabledProtocol(device.name);
  if (!protocolResult.allowed) {
    logger.info(
      `Device "${device.name}" blocked by protocol filter (protocol: ${protocolResult.protocol})`
    );
    // Safety: stop the device in case engine auto-activated anything
    try { await device.stop(); } catch { /* ignore */ }
    // Record as auto-denied so it shows in the blocked device list
    const record = await getOrCreateDevice(device.name, identifier);
    if (record.status === "pending") {
      await denyDevice(record.id);
    }
    await updateLastSeen(record.id);
    notifyDiscoveredListeners();
    return;
  }

  // Step 2: Record in approval database
  discoveredDeviceMap.set(device.index, { name: device.name, identifier });
  const record = await getOrCreateDevice(device.name, identifier);
  await updateLastSeen(record.id);

  logger.info(
    `Device discovered: "${device.name}" (status: ${record.status}, protocol: ${protocolResult.protocol})`
  );

  // Notify discovered listeners (for Settings UI refresh)
  notifyDiscoveredListeners();

  // Step 3: Only notify device listeners (ToyBox etc.) if approved
  if (record.status === "approved") {
    notifyDeviceListeners();
  }
}

function handleDeviceRemoved(device: ButtplugClientDevice): void {
  discoveredDeviceMap.delete(device.index);
  notifyDeviceListeners();
  notifyDiscoveredListeners();
}

export async function connectClient(): Promise<void> {
  if (client?.connected) return;

  client = new ButtplugClient("PlayRooms");

  client.addListener("deviceadded", (device: ButtplugClientDevice) => {
    handleDeviceAdded(device).catch((err) =>
      logger.error("Error handling device added:", err)
    );
  });
  client.addListener("deviceremoved", (device: ButtplugClientDevice) => {
    handleDeviceRemoved(device);
  });

  const connector = new ButtplugNodeWebsocketClientConnector(
    `ws://127.0.0.1:${config.intifacePort}`
  );

  try {
    await client.connect(connector);
    logger.info("Connected to Intiface Engine");
  } catch (err) {
    logger.error("Connection failed:", err);
    client = null;
    throw err;
  }
}

export async function disconnectClient(): Promise<void> {
  if (client?.connected) {
    await client.disconnect();
    logger.info("Disconnected");
  }
  client = null;
  scanning = false;
  discoveredDeviceMap.clear();
}

export async function startScanning(): Promise<void> {
  if (!client?.connected) throw new Error("Buttplug client not connected");
  await client.startScanning();
  scanning = true;
  logger.info("Scanning started");

  // Server-side auto-stop after configured timeout
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(async () => {
    try {
      await stopScanning();
      logger.info(`Scan auto-stopped after ${config.scanTimeout}ms`);
    } catch (err) {
      scanning = false;
      logger.error("Error auto-stopping scan:", err);
    }
  }, config.scanTimeout);
}

export async function stopScanning(): Promise<void> {
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  if (!client?.connected) { scanning = false; return; }
  await client.stopScanning();
  scanning = false;
  logger.info("Scanning stopped");
}

export function isScanning(): boolean {
  return scanning;
}

export async function sendCommand(cmd: DeviceCommand): Promise<void> {
  if (!client?.connected) throw new Error("Buttplug client not connected");

  const device = client.devices.find((d) => String(d.index) === cmd.deviceId);
  if (!device) throw new Error(`Device ${cmd.deviceId} not found`);

  // Only allow commands to approved devices
  const identifier = discoveredDeviceMap.get(device.index)?.identifier;
  if (identifier && !(await isDeviceApproved(identifier))) {
    throw new Error(`Device ${cmd.deviceId} is not approved`);
  }

  let value = Math.max(0, Math.min(1, cmd.value));

  // Apply global device settings (intensity cap, command restrictions)
  if (identifier) {
    const record = await getDeviceByIdentifier(identifier);
    if (record) {
      const settings = JSON.parse(record.globalSettings || "{}");

      // Check allowed commands (stop is always permitted)
      if (cmd.command !== "stop" && settings.allowedCommands?.length > 0) {
        if (!settings.allowedCommands.includes(cmd.command)) {
          throw new Error(`Command "${cmd.command}" not allowed for this device`);
        }
      }

      // Clamp intensity to global max
      if (typeof settings.maxIntensity === "number" && settings.maxIntensity < 1.0) {
        value = Math.min(value, settings.maxIntensity);
      }
    }
  }

  switch (cmd.command) {
    case "vibrate":
      await device.vibrate(value);
      break;
    case "rotate":
      await device.rotate(value, true);
      break;
    case "linear":
      await device.linear(value, 500);
      break;
    case "stop":
      await device.stop();
      break;
    default:
      throw new Error(`Unknown command: ${cmd.command}`);
  }
}

export function isConnected(): boolean {
  return client?.connected ?? false;
}

/**
 * Re-evaluate all discovered devices against current approval status.
 * Called after a device is approved/denied to immediately update the device list.
 */
export function refreshDeviceStates(): void {
  notifyDeviceListeners();
  notifyDiscoveredListeners();
}
