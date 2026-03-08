import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { rooms, devices, type Room, type WidgetConfig, type DiscoveredDevice } from "../../lib/api";

const WIDGET_TYPES = [
  { type: "toybox" as const, label: "Toy Box", description: "Buttplug.io device controls" },
  { type: "textchat" as const, label: "Text Chat", description: "Real-time text messaging" },
  { type: "webcam" as const, label: "Web Cam", description: "Host webcam stream" },
  { type: "videochat" as const, label: "Video Chat", description: "Multi-participant video" },
  { type: "voicechat" as const, label: "Voice Chat", description: "Push-to-talk or open mic" },
];

interface RoomConfigProps {
  room: Room;
  onSave: (room: Room) => void;
}

export default function RoomConfig({ room, onSave }: RoomConfigProps) {
  const [name, setName] = useState(room.name);
  const [accessMode, setAccessMode] = useState(room.accessMode);
  const [challengeType, setChallengeType] = useState(room.challengeType ?? "code");
  const [maxGuests, setMaxGuests] = useState(room.maxGuests);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(room.widgets);
  const [saving, setSaving] = useState(false);

  // Device assignment state
  const [approvedDevices, setApprovedDevices] = useState<DiscoveredDevice[]>([]);
  const [assignedDeviceIds, setAssignedDeviceIds] = useState<Set<string>>(new Set());
  const [loadingDevices, setLoadingDevices] = useState(true);

  useEffect(() => {
    loadDevices();
  }, [room.id]);

  async function loadDevices() {
    setLoadingDevices(true);
    try {
      const [discovered, roomDevices] = await Promise.all([
        devices.discovered(),
        devices.listForRoom(room.id),
      ]);
      setApprovedDevices(discovered.filter((d) => d.status === "approved"));
      setAssignedDeviceIds(new Set(roomDevices.map((d) => d.id)));
    } catch (err) {
      console.error("Failed to load devices:", err);
    } finally {
      setLoadingDevices(false);
    }
  }

  async function toggleDevice(device: DiscoveredDevice) {
    const isAssigned = assignedDeviceIds.has(device.id);
    try {
      if (isAssigned) {
        // Find the room device record to unassign by its ID
        const roomDeviceList = await devices.listForRoom(room.id);
        const roomDevice = roomDeviceList.find(
          (rd) => rd.name === device.name || String(rd.buttplugIndex) === device.id
        );
        if (roomDevice) {
          await devices.unassign(roomDevice.id);
          setAssignedDeviceIds((prev) => {
            const next = new Set(prev);
            next.delete(device.id);
            return next;
          });
        }
      } else {
        // Find the buttplug index for this device from the live devices list
        const liveDevices = await devices.list();
        const liveDevice = liveDevices.find((d) => d.name === device.name);
        if (liveDevice) {
          await devices.assign(liveDevice.id, room.id);
          setAssignedDeviceIds((prev) => new Set(prev).add(device.id));
        }
      }
    } catch (err) {
      console.error("Failed to toggle device assignment:", err);
    }
  }

  function isDeviceAssigned(device: DiscoveredDevice): boolean {
    return assignedDeviceIds.has(device.id);
  }

  function toggleWidget(type: WidgetConfig["type"]) {
    setWidgets((prev) => {
      const existing = prev.find((w) => w.type === type);
      if (existing) {
        return prev.map((w) => (w.type === type ? { ...w, enabled: !w.enabled } : w));
      }
      return [...prev, { type, enabled: true, settings: {} }];
    });
  }

  function isWidgetEnabled(type: WidgetConfig["type"]): boolean {
    return widgets.find((w) => w.type === type)?.enabled ?? false;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await rooms.update(room.id, {
        name,
        accessMode,
        challengeType: accessMode === "challenge" ? challengeType : undefined,
        maxGuests,
        widgets,
      });
      onSave(updated);
    } catch (err) {
      console.error("Failed to save room:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Room Settings</h3>

      <div className="space-y-4">
        <div>
          <label className="label">Room Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="label">Access Mode</label>
          <select className="input" value={accessMode} onChange={(e) => setAccessMode(e.target.value as "open" | "challenge")}>
            <option value="open">Open</option>
            <option value="challenge">Challenge</option>
          </select>
        </div>

        {accessMode === "challenge" && (
          <div>
            <label className="label">Challenge Type</label>
            <select className="input" value={challengeType} onChange={(e) => setChallengeType(e.target.value as "code" | "approval")}>
              <option value="code">Access Code</option>
              <option value="approval">Host Approval</option>
            </select>
          </div>
        )}

        <div>
          <label className="label">Max Guests (1-4)</label>
          <input className="input" type="number" min={1} max={4} value={maxGuests} onChange={(e) => setMaxGuests(Number(e.target.value))} />
        </div>

        <div>
          <label className="label">Widgets</label>
          <div className="space-y-2">
            {WIDGET_TYPES.map((wt) => (
              <label key={wt.type} className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isWidgetEnabled(wt.type)}
                  onChange={() => toggleWidget(wt.type)}
                  className="rounded accent-primary-500"
                />
                <div>
                  <span className="font-medium text-sm">{wt.label}</span>
                  <p className="text-xs text-slate-400">{wt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Devices</label>
          {loadingDevices ? (
            <p className="text-sm text-slate-400">Loading devices...</p>
          ) : approvedDevices.length === 0 ? (
            <p className="text-sm text-slate-400">
              No approved devices. Start Engine and approve devices in Settings.
            </p>
          ) : (
            <div className="space-y-2">
              {approvedDevices.map((device) => (
                <label key={device.id} className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDeviceAssigned(device)}
                    onChange={() => toggleDevice(device)}
                    className="rounded accent-primary-500"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-sm">{device.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-block w-2 h-2 rounded-full ${device.connected ? "bg-green-400" : "bg-red-400"}`} />
                      <span className="text-xs text-slate-400">{device.connected ? "Connected" : "Disconnected"}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
