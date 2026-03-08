import { useState, useEffect, useCallback } from "react";
import type { Socket } from "socket.io-client";
import type { DeviceState } from "../lib/api";

export function useButtplug(socket: Socket | null) {
  const [devices, setDevices] = useState<DeviceState[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleDeviceState = (device: DeviceState) => {
      setDevices((prev) => {
        const idx = prev.findIndex((d) => d.id === device.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = device;
          return next;
        }
        return [...prev, device];
      });
    };

    const handleRoomState = (data: { devices: DeviceState[] }) => {
      setDevices(data.devices);
    };

    socket.on("device:state", handleDeviceState);
    socket.on("room:state", handleRoomState);

    return () => {
      socket.off("device:state", handleDeviceState);
      socket.off("room:state", handleRoomState);
    };
  }, [socket]);

  const sendCommand = useCallback(
    (deviceId: string, command: "vibrate" | "rotate" | "linear" | "stop", value: number) => {
      socket?.emit("device:command", { deviceId, command, value });
    },
    [socket]
  );

  return { devices, sendCommand };
}
