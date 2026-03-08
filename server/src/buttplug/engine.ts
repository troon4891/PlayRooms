import { spawn, ChildProcess } from "child_process";
import { existsSync, readdirSync } from "fs";
import { config } from "../config.js";
import type { TransportConfig } from "../config.js";
import { createLogger } from "../logger.js";

const logger = createLogger("Engine");

let engineProcess: ChildProcess | null = null;

/**
 * Check whether hardware appears to be available for each enabled transport.
 * These are best-effort heuristic checks — a false positive is acceptable
 * (the engine will just fail to find devices), but a false negative would
 * suppress a valid transport, so checks are conservative.
 */
function checkTransportHardware(transports: TransportConfig): void {
  logger.debug("Transport configuration:");
  logger.debug(`  Bluetooth LE: ${transports.bluetooth ? "ENABLED" : "disabled"}`);
  logger.debug(`  Serial Port:  ${transports.serial ? "ENABLED" : "disabled"}`);
  logger.debug(`  USB HID:      ${transports.hid ? "ENABLED" : "disabled"}`);

  if (transports.bluetooth) {
    try {
      const hciPath = "/sys/class/bluetooth";
      if (existsSync(hciPath)) {
        const adapters = readdirSync(hciPath);
        if (adapters.length > 0) {
          logger.debug(`  Bluetooth hardware: Found adapter(s): ${adapters.join(", ")}`);
        } else {
          logger.warn(
            "Bluetooth LE is enabled but no Bluetooth adapter was detected " +
            "(/sys/class/bluetooth/ is empty). Ensure the host has a Bluetooth adapter " +
            "and the add-on has host_dbus access."
          );
        }
      } else {
        logger.warn(
          "Bluetooth LE is enabled but no Bluetooth adapter was detected " +
          "(/sys/class/bluetooth not found). Ensure the host has a Bluetooth adapter " +
          "and the add-on has host_dbus access."
        );
      }
    } catch {
      logger.warn(
        "Bluetooth LE is enabled but hardware check failed " +
        "(could not read /sys/class/bluetooth)."
      );
    }
  }

  if (transports.serial) {
    try {
      const devEntries = readdirSync("/dev");
      const serialDevices = devEntries.filter(
        (d) => d.startsWith("ttyUSB") || d.startsWith("ttyACM")
      );
      if (serialDevices.length > 0) {
        logger.debug(
          `  Serial hardware: Found device(s): ${serialDevices.map((d) => "/dev/" + d).join(", ")}`
        );
      } else {
        logger.warn(
          "Serial port transport is enabled but no serial devices were found " +
          "(/dev/ttyUSB* or /dev/ttyACM*). Ensure a serial device is connected to the host " +
          "and the add-on has uart access."
        );
      }
    } catch {
      logger.warn(
        "Serial port transport is enabled but hardware check failed " +
        "(could not enumerate /dev)."
      );
    }
  }

  if (transports.hid) {
    try {
      const devEntries = readdirSync("/dev");
      const hidDevices = devEntries.filter((d) => d.startsWith("hidraw"));
      if (hidDevices.length > 0) {
        logger.debug(
          `  HID hardware: Found device(s): ${hidDevices.map((d) => "/dev/" + d).join(", ")}`
        );
      } else {
        logger.warn(
          "USB HID transport is enabled but no HID devices were found " +
          "(/dev/hidraw*). Ensure a USB HID device is connected to the host " +
          "and the add-on has usb access."
        );
      }
    } catch {
      logger.warn(
        "USB HID transport is enabled but hardware check failed " +
        "(could not enumerate /dev)."
      );
    }
  }
}

/**
 * Build the intiface-engine CLI arguments based on transport configuration.
 *
 * When at least one transport is enabled, pass only the corresponding --use-*
 * flags so the engine activates exactly those transports. When no transports
 * are enabled, pass no --use-* flags and log a warning.
 *
 * Flag names are for intiface-engine v1.4.8. If the binary uses different
 * names, update this function and verify with: intiface-engine --help
 */
function buildEngineArgs(): string[] {
  const args = ["--websocket-port", String(config.intifacePort)];
  const { bluetooth, serial, hid } = config.transports;

  const anyEnabled = bluetooth || serial || hid;

  if (!anyEnabled) {
    logger.warn(
      "No transports are enabled. Device scanning will not find " +
      "any hardware devices. Enable at least one transport (Bluetooth, Serial, or " +
      "USB HID) in the add-on configuration."
    );
    return args;
  }

  if (bluetooth) {
    args.push("--use-bluetooth-le");
  }

  if (serial) {
    args.push("--use-serial");
    args.push("--use-lovense-dongle");
  }

  if (hid) {
    args.push("--use-hid");
    if (!serial) {
      args.push("--use-lovense-dongle");
    }
  }

  return args;
}

export function startEngine(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (engineProcess) {
      resolve();
      return;
    }

    // Log transport configuration and hardware status before starting
    checkTransportHardware(config.transports);

    const args = buildEngineArgs();

    logger.info(`Starting Intiface Engine on port ${config.intifacePort}`);
    logger.debug(`Arguments: ${args.join(" ")}`);

    engineProcess = spawn("intiface-engine", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    engineProcess.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (/error|ERROR/.test(line)) {
        logger.error(line);
      } else {
        logger.debug(line);
      }
    });

    engineProcess.stderr?.on("data", (data: Buffer) => {
      logger.warn(data.toString().trim());
    });

    engineProcess.on("error", (err) => {
      logger.error("Failed to start:", err.message);
      engineProcess = null;
      reject(err);
    });

    engineProcess.on("exit", (code) => {
      logger.info(`Exited with code ${code}`);
      engineProcess = null;
    });

    // Give the engine time to start up
    setTimeout(() => {
      if (engineProcess && !engineProcess.killed) {
        resolve();
      } else {
        reject(new Error("Intiface Engine did not start"));
      }
    }, 2000);
  });
}

export function stopEngine(): void {
  if (engineProcess) {
    logger.info("Stopping Intiface Engine");
    engineProcess.kill("SIGTERM");
    engineProcess = null;
  }
}

export async function restartEngine(): Promise<void> {
  logger.info("Restarting Intiface Engine...");
  stopEngine();
  // Wait for process to fully exit
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await startEngine();
  logger.info("Restart complete");
}

export function isEngineRunning(): boolean {
  return engineProcess !== null && !engineProcess.killed;
}
