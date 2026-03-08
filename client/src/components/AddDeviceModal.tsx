import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Search,
  StopCircle,
  Plus,
  Ban,
  Check,
  Unlock,
  Settings2,
  Vibrate,
  RotateCw,
  MoveVertical,
  Loader2,
} from "lucide-react";
import { devices as devicesApi } from "../lib/api";
import type { DiscoveredDevice, DeviceGlobalSettings } from "../lib/api";

interface AddDeviceModalProps {
  open: boolean;
  onClose: () => void;
  engineReady: boolean;
}

export default function AddDeviceModal({ open, onClose, engineReady }: AddDeviceModalProps) {
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [scanTimeout, setScanTimeout] = useState(30000);
  const [elapsed, setElapsed] = useState(0);
  const [expandedSettings, setExpandedSettings] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanStartRef = useRef<number>(0);

  const loadDiscovered = useCallback(async () => {
    try {
      const list = await devicesApi.discovered();
      setDiscovered(list);
    } catch (err) {
      console.error("Failed to load discovered devices:", err);
    }
  }, []);

  // Load scan timeout from server on mount
  useEffect(() => {
    if (!open) return;
    devicesApi.scanStatus().then((s) => {
      setScanTimeout(s.scanTimeout);
      if (s.scanning) setScanning(true);
    }).catch(() => {});
    loadDiscovered();
  }, [open, loadDiscovered]);

  // Poll for discovered devices while scanning
  useEffect(() => {
    if (!scanning) return;
    pollRef.current = setInterval(loadDiscovered, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scanning, loadDiscovered]);

  // Elapsed time counter during scan
  useEffect(() => {
    if (!scanning) {
      setElapsed(0);
      return;
    }
    scanStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - scanStartRef.current);
    }, 250);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [scanning]);

  // Auto-stop scanning state when elapsed exceeds timeout
  useEffect(() => {
    if (scanning && elapsed >= scanTimeout) {
      setScanning(false);
      loadDiscovered();
    }
  }, [scanning, elapsed, scanTimeout, loadDiscovered]);

  async function handleStartScan() {
    try {
      await devicesApi.startScan();
      setScanning(true);
    } catch (err) {
      console.error("Scan failed:", err);
    }
  }

  async function handleStopScan() {
    try {
      await devicesApi.stopScan();
      setScanning(false);
      await loadDiscovered();
    } catch (err) {
      console.error("Stop scan failed:", err);
    }
  }

  async function handleApprove(id: string) {
    await devicesApi.approve(id);
    await loadDiscovered();
  }

  async function handleDeny(id: string) {
    await devicesApi.deny(id);
    await loadDiscovered();
  }

  async function handleUnblock(id: string) {
    await devicesApi.reset(id);
    await loadDiscovered();
  }

  async function handleForget(id: string) {
    await devicesApi.forget(id);
    await loadDiscovered();
  }

  async function handleSettingsUpdate(id: string, settings: Partial<DeviceGlobalSettings>) {
    await devicesApi.updateSettings(id, settings);
    await loadDiscovered();
  }

  function handleClose() {
    if (scanning) {
      handleStopScan();
    }
    setExpandedSettings(null);
    onClose();
  }

  if (!open) return null;

  const remaining = Math.max(0, Math.ceil((scanTimeout - elapsed) / 1000));
  const progress = Math.min(1, elapsed / scanTimeout);

  // Group devices
  const pendingDevices = discovered.filter((d) => d.status === "pending");
  const approvedDevices = discovered.filter((d) => d.status === "approved");
  const deniedDevices = discovered.filter((d) => d.status === "denied");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold">Add New Device</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Scan controls */}
          {!engineReady ? (
            <div className="text-slate-400 text-sm">
              Start the engine in Settings before scanning for devices.
            </div>
          ) : scanning ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-purple-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning... {remaining}s remaining
                </span>
                <button
                  onClick={handleStopScan}
                  className="btn-danger text-xs px-3 py-1 flex items-center gap-1"
                >
                  <StopCircle className="w-3 h-3" /> Stop
                </button>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div
                  className="bg-purple-500 h-1.5 rounded-full transition-all duration-250"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleStartScan}
              className="btn-primary flex items-center gap-2 text-sm w-full justify-center py-2"
            >
              <Search className="w-4 h-4" /> Scan for Devices
            </button>
          )}

          {/* New / Pending devices */}
          {pendingDevices.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">New Devices</h3>
              <div className="space-y-2">
                {pendingDevices.map((d) => (
                  <DeviceRow
                    key={d.id}
                    device={d}
                    onApprove={handleApprove}
                    onDeny={handleDeny}
                    expandedSettings={expandedSettings}
                    onToggleSettings={setExpandedSettings}
                    onSettingsUpdate={handleSettingsUpdate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Approved devices */}
          {approvedDevices.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Added Devices</h3>
              <div className="space-y-2">
                {approvedDevices.map((d) => (
                  <DeviceRow
                    key={d.id}
                    device={d}
                    onDeny={handleDeny}
                    onForget={handleForget}
                    expandedSettings={expandedSettings}
                    onToggleSettings={setExpandedSettings}
                    onSettingsUpdate={handleSettingsUpdate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Blocked devices */}
          {deniedDevices.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Blocked</h3>
              <div className="space-y-2">
                {deniedDevices.map((d) => (
                  <DeviceRow
                    key={d.id}
                    device={d}
                    onUnblock={handleUnblock}
                    onForget={handleForget}
                    expandedSettings={expandedSettings}
                    onToggleSettings={setExpandedSettings}
                    onSettingsUpdate={handleSettingsUpdate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {discovered.length === 0 && !scanning && (
            <p className="text-slate-400 text-sm text-center py-8">
              No devices found. Start a scan to discover nearby devices.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-slate-700">
          <button onClick={handleClose} className="btn-primary px-6 py-2 text-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function DeviceRow({
  device,
  onApprove,
  onDeny,
  onUnblock,
  onForget,
  expandedSettings,
  onToggleSettings,
  onSettingsUpdate,
}: {
  device: DiscoveredDevice;
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
  onUnblock?: (id: string) => void;
  onForget?: (id: string) => void;
  expandedSettings: string | null;
  onToggleSettings: (id: string | null) => void;
  onSettingsUpdate: (id: string, settings: Partial<DeviceGlobalSettings>) => void;
}) {
  const isExpanded = expandedSettings === device.id;
  const settings = device.globalSettings || { maxIntensity: 1.0, allowedCommands: ["vibrate", "rotate", "linear", "stop"], displayName: null };

  const statusIcon =
    device.status === "approved" ? (
      <Check className="w-4 h-4 text-green-400" />
    ) : device.status === "denied" ? (
      <Ban className="w-4 h-4 text-red-400" />
    ) : (
      <div className="w-4 h-4 rounded-full border-2 border-slate-500" />
    );

  const lastSeen = device.lastSeenAt
    ? new Date(device.lastSeenAt).toLocaleDateString()
    : "Never";

  return (
    <div className="bg-slate-700/50 rounded-lg">
      <div className="flex items-center gap-3 p-3">
        {statusIcon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {settings.displayName || device.name}
            </span>
            {device.connected && (
              <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {device.protocol && <span>{device.protocol}</span>}
            <span>Last seen: {lastSeen}</span>
          </div>
        </div>

        {/* Capabilities badges */}
        <div className="flex gap-1">
          {device.capabilities.vibrate && <Vibrate className="w-3 h-3 text-slate-400" />}
          {device.capabilities.rotate && <RotateCw className="w-3 h-3 text-slate-400" />}
          {device.capabilities.linear && <MoveVertical className="w-3 h-3 text-slate-400" />}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {device.status === "approved" && (
            <button
              onClick={() => onToggleSettings(isExpanded ? null : device.id)}
              className="text-slate-400 hover:text-white p-1 transition"
              title="Device Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          {onApprove && device.status === "pending" && (
            <button
              onClick={() => onApprove(device.id)}
              className="btn-primary text-xs px-2 py-1 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
          {onDeny && device.status === "pending" && (
            <button
              onClick={() => onDeny(device.id)}
              className="btn-danger text-xs px-2 py-1 flex items-center gap-1"
            >
              <Ban className="w-3 h-3" /> Block
            </button>
          )}
          {onUnblock && device.status === "denied" && (
            <button
              onClick={() => onUnblock(device.id)}
              className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
            >
              <Unlock className="w-3 h-3" /> Unblock
            </button>
          )}
          {onForget && (device.status === "denied" || device.status === "approved") && (
            <button
              onClick={() => onForget(device.id)}
              className="text-slate-500 hover:text-red-400 p-1 transition text-xs"
              title="Forget device"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded settings panel */}
      {isExpanded && device.status === "approved" && (
        <DeviceSettingsPanel
          device={device}
          settings={settings}
          onUpdate={(s) => onSettingsUpdate(device.id, s)}
          onDeny={onDeny ? () => onDeny(device.id) : undefined}
          onForget={onForget ? () => onForget(device.id) : undefined}
        />
      )}
    </div>
  );
}

function DeviceSettingsPanel({
  device,
  settings,
  onUpdate,
  onDeny,
  onForget,
}: {
  device: DiscoveredDevice;
  settings: DeviceGlobalSettings;
  onUpdate: (settings: Partial<DeviceGlobalSettings>) => void;
  onDeny?: () => void;
  onForget?: () => void;
}) {
  const [maxIntensity, setMaxIntensity] = useState(Math.round((settings.maxIntensity ?? 1.0) * 100));
  const [displayName, setDisplayName] = useState(settings.displayName || "");
  const [commands, setCommands] = useState<string[]>(
    settings.allowedCommands ?? ["vibrate", "rotate", "linear", "stop"]
  );

  function toggleCommand(cmd: string) {
    if (cmd === "stop") return; // stop is always allowed
    const updated = commands.includes(cmd)
      ? commands.filter((c) => c !== cmd)
      : [...commands, cmd];
    setCommands(updated);
    onUpdate({ allowedCommands: updated });
  }

  function handleIntensityChange(value: number) {
    setMaxIntensity(value);
    onUpdate({ maxIntensity: value / 100 });
  }

  function handleDisplayNameBlur() {
    onUpdate({ displayName: displayName || null });
  }

  return (
    <div className="px-3 pb-3 pt-1 border-t border-slate-600 space-y-3">
      {/* Display Name */}
      <div>
        <label className="text-xs text-slate-400 block mb-1">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={handleDisplayNameBlur}
          placeholder={device.name}
          className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm"
        />
      </div>

      {/* Max Intensity */}
      <div>
        <label className="text-xs text-slate-400 block mb-1">
          Max Intensity: {maxIntensity}%
        </label>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={maxIntensity}
          onChange={(e) => handleIntensityChange(Number(e.target.value))}
          className="w-full accent-primary-500"
        />
      </div>

      {/* Allowed Commands */}
      <div>
        <label className="text-xs text-slate-400 block mb-1">Allowed Commands</label>
        <div className="flex gap-2 flex-wrap">
          {["vibrate", "rotate", "linear"].map((cmd) => (
            <label
              key={cmd}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition ${
                commands.includes(cmd)
                  ? "bg-primary-600/30 text-primary-300 border border-primary-500/50"
                  : "bg-slate-600/50 text-slate-400 border border-slate-500/50"
              }`}
            >
              <input
                type="checkbox"
                checked={commands.includes(cmd)}
                onChange={() => toggleCommand(cmd)}
                className="sr-only"
              />
              {cmd === "vibrate" && <Vibrate className="w-3 h-3" />}
              {cmd === "rotate" && <RotateCw className="w-3 h-3" />}
              {cmd === "linear" && <MoveVertical className="w-3 h-3" />}
              {cmd.charAt(0).toUpperCase() + cmd.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="flex gap-2 pt-1">
        {onDeny && (
          <button
            onClick={onDeny}
            className="btn-danger text-xs px-2 py-1 flex items-center gap-1"
          >
            <Ban className="w-3 h-3" /> Block Device
          </button>
        )}
        {onForget && (
          <button
            onClick={onForget}
            className="text-slate-500 hover:text-red-400 text-xs px-2 py-1 flex items-center gap-1 transition"
          >
            <X className="w-3 h-3" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
