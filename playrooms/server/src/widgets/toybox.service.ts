import { v4 as uuidv4 } from "uuid";
import { eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import * as buttplugClient from "../buttplug/client.js";
import type { DeviceCommand } from "../types/index.js";
import { createLogger } from "../logger.js";

const logger = createLogger("ToyBox");

export async function listAllDevices() {
  return buttplugClient.getDeviceStates();
}

export async function getDevicesForRoom(roomId: string) {
  const assigned = db
    .select()
    .from(schema.devices)
    .where(eq(schema.devices.roomId, roomId))
    .all();

  const liveDevices = await buttplugClient.getDeviceStates();

  return assigned.map((d) => {
    const live = liveDevices.find((ld) => ld.id === String(d.buttplugIndex));
    return {
      ...d,
      settings: JSON.parse(d.settings),
      connected: live?.connected ?? false,
      capabilities: live?.capabilities ?? { vibrate: false, rotate: false, linear: false, battery: false },
      batteryLevel: live?.batteryLevel ?? null,
      globalSettings: live?.globalSettings ?? undefined,
    };
  });
}

export async function assignDeviceToRoom(buttplugIndex: number, roomId: string, settings?: Record<string, unknown>) {
  const liveDevices = await buttplugClient.getDeviceStates();
  const device = liveDevices.find((d) => d.id === String(buttplugIndex));

  if (!device) throw new Error(`Device ${buttplugIndex} not found`);

  // Check if already registered
  const existing = db
    .select()
    .from(schema.devices)
    .where(eq(schema.devices.buttplugIndex, buttplugIndex))
    .get();

  if (existing) {
    db.update(schema.devices)
      .set({ roomId, settings: JSON.stringify(settings ?? {}) })
      .where(eq(schema.devices.id, existing.id))
      .run();
    return { ...existing, roomId, settings: settings ?? {} };
  }

  const newDevice = {
    id: uuidv4(),
    buttplugIndex,
    name: device.name,
    roomId,
    settings: JSON.stringify(settings ?? {}),
  };

  db.insert(schema.devices).values(newDevice).run();
  logger.info(`Device "${device.name}" assigned to room ${roomId}`);
  return { ...newDevice, settings: settings ?? {} };
}

export function unassignDevice(deviceId: string) {
  db.update(schema.devices)
    .set({ roomId: null })
    .where(eq(schema.devices.id, deviceId))
    .run();
  logger.info(`Device ${deviceId} unassigned from room`);
}

export async function sendDeviceCommand(cmd: DeviceCommand): Promise<void> {
  logger.debug(`Command: device=${cmd.deviceId} ${cmd.command} value=${cmd.value}`);
  await buttplugClient.sendCommand(cmd);
}

export function getUnassignedDevices() {
  return db
    .select()
    .from(schema.devices)
    .where(isNull(schema.devices.roomId))
    .all()
    .map((d) => ({ ...d, settings: JSON.parse(d.settings) }));
}
