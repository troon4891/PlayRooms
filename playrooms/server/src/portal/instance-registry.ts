import type { Socket } from "socket.io";
import { createLogger } from "../logger.js";

const logger = createLogger("Portal");

interface InstanceInfo {
  instanceId: string;
  socket: Socket;
  prefix: string;
  connectedAt: number;
}

/** Maps instanceId -> InstanceInfo */
const instances = new Map<string, InstanceInfo>();

/** Maps 8-char prefix -> instanceId for token routing */
const prefixIndex = new Map<string, string>();

export function registerInstance(instanceId: string, socket: Socket): void {
  const prefix = instanceId.substring(0, 8);
  instances.set(instanceId, {
    instanceId,
    socket,
    prefix,
    connectedAt: Date.now(),
  });
  prefixIndex.set(prefix, instanceId);
  logger.info(`HA instance registered: ${instanceId} (prefix: ${prefix})`);
}

export function unregisterInstance(instanceId: string): void {
  const info = instances.get(instanceId);
  if (info) {
    prefixIndex.delete(info.prefix);
    instances.delete(instanceId);
    logger.info(`HA instance unregistered: ${instanceId}`);
  }
}

export function getInstance(instanceId: string): Socket | null {
  return instances.get(instanceId)?.socket ?? null;
}

export function getInstanceByPrefix(prefix: string): Socket | null {
  const instanceId = prefixIndex.get(prefix);
  if (!instanceId) return null;
  return instances.get(instanceId)?.socket ?? null;
}

export function getInstanceIdByPrefix(prefix: string): string | null {
  return prefixIndex.get(prefix) ?? null;
}

/** For single-instance deployments, returns the first connected instance */
export function getDefaultInstance(): { instanceId: string; socket: Socket } | null {
  const first = instances.values().next();
  if (first.done) return null;
  return { instanceId: first.value.instanceId, socket: first.value.socket };
}

export function getConnectedInstanceCount(): number {
  return instances.size;
}

export function getAllInstanceIds(): string[] {
  return Array.from(instances.keys());
}
