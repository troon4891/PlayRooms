import { useState } from "react";
import { Vibrate, RotateCw, MoveVertical, StopCircle } from "lucide-react";
import type { DeviceState } from "../../lib/api";

interface ToyBoxProps {
  devices: DeviceState[];
  onCommand: (deviceId: string, command: "vibrate" | "rotate" | "linear" | "stop", value: number) => void;
  isHost: boolean;
}

export default function ToyBox({ devices, onCommand, isHost }: ToyBoxProps) {
  const [intensities, setIntensities] = useState<Record<string, number>>({});

  function getIntensity(deviceId: string): number {
    return intensities[deviceId] ?? 0;
  }

  function setIntensity(deviceId: string, value: number) {
    setIntensities((prev) => ({ ...prev, [deviceId]: value }));
  }

  return (
    <div className="card h-full">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Vibrate className="w-5 h-5 text-primary-400" /> Toy Box
      </h3>

      {devices.length === 0 ? (
        <p className="text-slate-400 text-sm">
          {isHost ? "No devices assigned to this room. Assign devices in Room Settings." : "No devices available."}
        </p>
      ) : (
        <div className="space-y-4">
          {devices.map((device) => {
            const gs = (device as DeviceState & { globalSettings?: { maxIntensity?: number; allowedCommands?: string[] } }).globalSettings;
            const maxPct = gs?.maxIntensity != null ? Math.round(gs.maxIntensity * 100) : 100;
            const allowedCmds = gs?.allowedCommands;
            const canVibrate = device.capabilities.vibrate && (!allowedCmds || allowedCmds.includes("vibrate"));
            const canRotate = device.capabilities.rotate && (!allowedCmds || allowedCmds.includes("rotate"));
            const canLinear = device.capabilities.linear && (!allowedCmds || allowedCmds.includes("linear"));

            return (
              <div key={device.id} className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{device.name}</span>
                  <div className={`w-2 h-2 rounded-full ${device.connected ? "bg-green-400" : "bg-red-400"}`} />
                </div>

                {/* Intensity slider */}
                <div className="mb-2">
                  <input
                    type="range"
                    min={0}
                    max={maxPct}
                    value={Math.min(getIntensity(device.id), maxPct)}
                    onChange={(e) => setIntensity(device.id, Number(e.target.value))}
                    className="w-full accent-primary-500"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{getIntensity(device.id)}%</span>
                    {maxPct < 100 && (
                      <span className="text-xs text-amber-400">max {maxPct}%</span>
                    )}
                  </div>
                </div>

                {/* Control buttons */}
                <div className="flex gap-2 flex-wrap">
                  {canVibrate && (
                    <button
                      onClick={() => onCommand(device.id, "vibrate", getIntensity(device.id) / 100)}
                      className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                      disabled={!device.connected}
                    >
                      <Vibrate className="w-3 h-3" /> Vibrate
                    </button>
                  )}
                  {canRotate && (
                    <button
                      onClick={() => onCommand(device.id, "rotate", getIntensity(device.id) / 100)}
                      className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                      disabled={!device.connected}
                    >
                      <RotateCw className="w-3 h-3" /> Rotate
                    </button>
                  )}
                  {canLinear && (
                    <button
                      onClick={() => onCommand(device.id, "linear", getIntensity(device.id) / 100)}
                      className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                      disabled={!device.connected}
                    >
                      <MoveVertical className="w-3 h-3" /> Linear
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onCommand(device.id, "stop", 0);
                      setIntensity(device.id, 0);
                    }}
                    className="btn-danger text-xs px-2 py-1 flex items-center gap-1"
                    disabled={!device.connected}
                  >
                    <StopCircle className="w-3 h-3" /> Stop
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
