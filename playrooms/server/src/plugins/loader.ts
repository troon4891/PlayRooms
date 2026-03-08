import { createLogger } from "../logger.js";

const logger = createLogger("PlayRooms");

export interface PluginManifest {
  type: "device-provider" | "pal";
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  license: string;
  providerApiVersion?: number;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  path: string;
}

const loadedPlugins: LoadedPlugin[] = [];

/**
 * Load plugins from configuration.
 *
 * For now, this is a stub that logs plugin loading status.
 * The Buttplug device provider remains as a built-in shim in server/src/buttplug/
 * until it is fully extracted to the PlayRooms-DP-Buttplug repository.
 */
export async function loadPlugins(): Promise<void> {
  logger.info("Plugin loader initialized");
  logger.info("Built-in Buttplug shim active (pending extraction to PlayRooms-DP-Buttplug)");
}

export function getLoadedPlugins(): readonly LoadedPlugin[] {
  return loadedPlugins;
}
