import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Power,
  PowerOff,
  CheckCircle,
  XCircle,
  Ban,
  Settings2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Vibrate,
  RotateCw,
  MoveVertical,
  X,
} from "lucide-react";
import {
  devices as devicesApi,
  engine as engineApi,
  protocols as protocolsApi,
  health,
  type DiscoveredDevice,
  type EngineStatus,
  type Protocol,
} from "../lib/api";
import AddDeviceModal from "../components/AddDeviceModal";

export default function Settings() {
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({ running: false, clientConnected: false });
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [protocolList, setProtocolList] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [engineLoading, setEngineLoading] = useState(false);
  const [showDenied, setShowDenied] = useState(false);
  const [showProtocols, setShowProtocols] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [protocolsChanged, setProtocolsChanged] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [version, setVersion] = useState("");

  const loadEngineStatus = useCallback(async () => {
    try {
      const status = await engineApi.status();
      setEngineStatus(status);
      return status;
    } catch {
      return { running: false, clientConnected: false };
    }
  }, []);

  const loadDiscovered = useCallback(async () => {
    try {
      const data = await devicesApi.discovered();
      setDiscovered(data);
    } catch {
      // may fail if engine not running
    }
  }, []);

  const loadProtocols = useCallback(async () => {
    try {
      const data = await protocolsApi.list();
      setProtocolList(data);
    } catch (err) {
      console.error("Failed to load protocols:", err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [, , healthData] = await Promise.all([
          loadEngineStatus(),
          loadDiscovered(),
          health(),
        ]);
        setVersion(healthData.version);
        await loadProtocols();
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [loadEngineStatus, loadDiscovered, loadProtocols]);

  async function handleStartEngine() {
    setEngineLoading(true);
    try {
      await engineApi.start();
      await loadEngineStatus();
    } catch (err) {
      console.error("Failed to start engine:", err);
    } finally {
      setEngineLoading(false);
    }
  }

  async function handleStopEngine() {
    setEngineLoading(true);
    try {
      await engineApi.stop();
      setEngineStatus({ running: false, clientConnected: false });
    } catch (err) {
      console.error("Failed to stop engine:", err);
    } finally {
      setEngineLoading(false);
    }
  }

  async function handleRestartEngine() {
    setRestartLoading(true);
    try {
      await engineApi.restart();
      setProtocolsChanged(false);
      await loadEngineStatus();
      await loadDiscovered();
    } catch (err) {
      console.error("Restart failed:", err);
    } finally {
      setRestartLoading(false);
    }
  }

  async function handleToggleProtocol(name: string, enabled: boolean) {
    try {
      await protocolsApi.setEnabled(name, enabled);
      setProtocolList((prev) =>
        prev.map((p) => (p.protocolName === name ? { ...p, enabled } : p))
      );
      setProtocolsChanged(true);
    } catch (err) {
      console.error("Toggle protocol failed:", err);
    }
  }

  async function handleForget(id: string) {
    try {
      await devicesApi.forget(id);
      await loadDiscovered();
    } catch (err) {
      console.error("Forget failed:", err);
    }
  }

  async function handleUnblock(id: string) {
    try {
      await devicesApi.reset(id);
      await loadDiscovered();
    } catch (err) {
      console.error("Unblock failed:", err);
    }
  }

  function handleModalClose() {
    setShowAddModal(false);
    loadDiscovered();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  const approvedDevices = discovered.filter((d) => d.status === "approved");
  const deniedDevices = discovered.filter((d) => d.status === "denied");

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <header className="flex items-center gap-3 mb-8">
        <Link to="/" className="text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>

      {/* Engine Controls */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-3">Intiface Engine</h2>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${engineStatus.running ? "bg-green-400" : "bg-red-400"}`} />
          <div className="flex-1">
            <span className="font-medium">
              Engine: {engineStatus.running ? "Running" : "Stopped"}
            </span>
            <span className="text-slate-400 text-sm ml-3">
              Client: {engineStatus.clientConnected ? "Connected" : "Not connected"}
            </span>
          </div>
          {engineStatus.running ? (
            <button
              onClick={handleStopEngine}
              disabled={engineLoading}
              className="btn-danger flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <PowerOff className="w-4 h-4" />
              {engineLoading ? "Stopping..." : "Stop Engine"}
            </button>
          ) : (
            <button
              onClick={handleStartEngine}
              disabled={engineLoading}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <Power className="w-4 h-4" />
              {engineLoading ? "Starting..." : "Start Engine"}
            </button>
          )}
        </div>
      </div>

      {/* Protocol restart banner */}
      {protocolsChanged && engineStatus.running && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
          <span className="text-sm text-amber-200">
            Protocol settings changed. Restart engine for changes to take effect.
          </span>
          <button
            onClick={handleRestartEngine}
            disabled={restartLoading}
            className="btn-primary text-xs px-3 py-1 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${restartLoading ? "animate-spin" : ""}`} />
            {restartLoading ? "Restarting..." : "Restart Now"}
          </button>
        </div>
      )}

      {/* Device Management */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Devices</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Add New Device
          </button>
        </div>

        {/* Approved (managed) devices */}
        {approvedDevices.length > 0 ? (
          <div className="space-y-2 mb-4">
            {approvedDevices.map((device) => (
              <ManagedDeviceRow key={device.id} device={device} onRefresh={loadDiscovered} />
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-sm mb-4">
            No devices added yet. Click "Add New Device" to scan and add devices.
          </p>
        )}

        {/* Blocked devices (collapsible) */}
        {deniedDevices.length > 0 && (
          <div>
            <button
              onClick={() => setShowDenied(!showDenied)}
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 mb-2"
            >
              {showDenied ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Blocked devices ({deniedDevices.length})
            </button>
            {showDenied && (
              <div className="space-y-2">
                {deniedDevices.map((device) => (
                  <div key={device.id} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Ban className="w-4 h-4 text-red-400" />
                      <div>
                        <span className="font-medium text-sm">{device.name}</span>
                        {device.protocol && (
                          <span className="text-xs text-slate-400 ml-2">({device.protocol})</span>
                        )}
                        {device.lastSeenAt && (
                          <span className="text-xs text-slate-500 ml-2">
                            Last seen: {new Date(device.lastSeenAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleUnblock(device.id)}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1"
                      >
                        Unblock
                      </button>
                      <button
                        onClick={() => handleForget(device.id)}
                        className="text-slate-500 hover:text-red-400 p-1 transition"
                        title="Forget device"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Protocol Allowlist */}
      <div className="card mb-6">
        <button
          onClick={() => {
            if (!showProtocols) loadProtocols();
            setShowProtocols(!showProtocols);
          }}
          className="flex items-center justify-between w-full"
        >
          <h2 className="text-lg font-semibold">Allowed Protocols</h2>
          {showProtocols ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>

        {showProtocols && (
          <div className="mt-3">
            <p className="text-sm text-slate-400 mb-3">
              Only devices matching enabled protocols will be recognized. Devices from disabled protocols are auto-blocked.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {protocolList.map((proto) => (
                <label
                  key={proto.protocolName}
                  className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={proto.enabled}
                    onChange={(e) => handleToggleProtocol(proto.protocolName, e.target.checked)}
                    className="w-4 h-4 rounded accent-purple-500"
                  />
                  <span className="text-sm">{proto.displayName}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* About */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">About</h2>
        <p className="text-sm text-slate-400">
          PlayRooms {version ? `v${version}` : ""} — A Home Assistant add-on for Buttplug.io device management with shareable Play Rooms.
        </p>
      </div>

      {/* Add Device Modal */}
      <AddDeviceModal
        open={showAddModal}
        onClose={handleModalClose}
        engineReady={engineStatus.running && engineStatus.clientConnected}
      />
    </div>
  );
}

// --- Managed Device Row (approved devices with settings) ---

function ManagedDeviceRow({
  device,
  onRefresh,
}: {
  device: DiscoveredDevice;
  onRefresh: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const settings = device.globalSettings || { maxIntensity: 1.0, allowedCommands: [], displayName: null };
  const maxPct = Math.round((settings.maxIntensity ?? 1.0) * 100);
  const displayName = settings.displayName || device.name;

  return (
    <div className="bg-slate-700/50 rounded-lg">
      <div className="flex items-center gap-3 px-4 py-3">
        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{displayName}</span>
            {device.connected && (
              <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            {device.protocol && <span>{device.protocol}</span>}
            {maxPct < 100 && <span className="text-amber-400">max {maxPct}%</span>}
            {/* Show disabled commands */}
            {settings.allowedCommands && settings.allowedCommands.length > 0 && settings.allowedCommands.length < 4 && (
              <span className="flex items-center gap-1">
                {settings.allowedCommands.includes("vibrate") && <Vibrate className="w-3 h-3" />}
                {settings.allowedCommands.includes("rotate") && <RotateCw className="w-3 h-3" />}
                {settings.allowedCommands.includes("linear") && <MoveVertical className="w-3 h-3" />}
              </span>
            )}
          </div>
        </div>

        {/* Capability badges */}
        <div className="flex gap-1 flex-shrink-0">
          {device.capabilities.vibrate && <Vibrate className="w-3.5 h-3.5 text-purple-400" />}
          {device.capabilities.rotate && <RotateCw className="w-3.5 h-3.5 text-blue-400" />}
          {device.capabilities.linear && <MoveVertical className="w-3.5 h-3.5 text-green-400" />}
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-slate-400 hover:text-white p-1 transition flex-shrink-0"
          title="Device Settings"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      {showSettings && (
        <InlineDeviceSettings device={device} onRefresh={onRefresh} />
      )}
    </div>
  );
}

function InlineDeviceSettings({
  device,
  onRefresh,
}: {
  device: DiscoveredDevice;
  onRefresh: () => void;
}) {
  const settings = device.globalSettings || { maxIntensity: 1.0, allowedCommands: ["vibrate", "rotate", "linear", "stop"], displayName: null };
  const [maxIntensity, setMaxIntensity] = useState(Math.round((settings.maxIntensity ?? 1.0) * 100));
  const [displayName, setDisplayName] = useState(settings.displayName || "");
  const [commands, setCommands] = useState<string[]>(
    settings.allowedCommands ?? ["vibrate", "rotate", "linear", "stop"]
  );
  const [saving, setSaving] = useState(false);

  async function save(update: Record<string, unknown>) {
    setSaving(true);
    try {
      await devicesApi.updateSettings(device.id, update);
      onRefresh();
    } catch (err) {
      console.error("Settings update failed:", err);
    } finally {
      setSaving(false);
    }
  }

  function toggleCommand(cmd: string) {
    if (cmd === "stop") return;
    const updated = commands.includes(cmd)
      ? commands.filter((c) => c !== cmd)
      : [...commands, cmd];
    setCommands(updated);
    save({ allowedCommands: updated });
  }

  async function handleDeny() {
    await devicesApi.deny(device.id);
    onRefresh();
  }

  async function handleForget() {
    await devicesApi.forget(device.id);
    onRefresh();
  }

  return (
    <div className="px-4 pb-3 pt-1 border-t border-slate-600 space-y-3">
      <div>
        <label className="text-xs text-slate-400 block mb-1">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={() => save({ displayName: displayName || null })}
          placeholder={device.name}
          className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm"
        />
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1">Max Intensity: {maxIntensity}%</label>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={maxIntensity}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMaxIntensity(v);
            save({ maxIntensity: v / 100 });
          }}
          className="w-full accent-primary-500"
          disabled={saving}
        />
      </div>

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

      <div className="flex gap-2 pt-1">
        <button onClick={handleDeny} className="btn-danger text-xs px-2 py-1 flex items-center gap-1">
          <XCircle className="w-3 h-3" /> Block
        </button>
        <button
          onClick={handleForget}
          className="text-slate-500 hover:text-red-400 text-xs px-2 py-1 flex items-center gap-1 transition"
        >
          <X className="w-3 h-3" /> Remove
        </button>
      </div>
    </div>
  );
}
