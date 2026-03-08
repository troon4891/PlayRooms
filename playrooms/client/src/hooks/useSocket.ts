import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { connectSocket, disconnectSocket } from "../lib/socket";

interface UseSocketOptions {
  roomId: string;
  isHost?: boolean;
  token?: string;
  name?: string;
}

export function useSocket(options: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = connectSocket(options);
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("error", (data: { message: string }) => setError(data.message));

    return () => {
      disconnectSocket();
      setConnected(false);
    };
  }, [options.roomId, options.isHost, options.token, options.name]);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  return { socket: socketRef.current, connected, error, emit, on };
}
