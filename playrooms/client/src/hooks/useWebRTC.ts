import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import { PeerConnectionManager } from "../lib/webrtc";

interface RemoteStream {
  peerId: string;
  stream: MediaStream;
}

export function useWebRTC(socket: Socket | null) {
  const managerRef = useRef<PeerConnectionManager | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);

  useEffect(() => {
    if (!socket) return;

    const manager = new PeerConnectionManager(
      socket,
      (peerId, stream) => {
        setRemoteStreams((prev) => {
          const filtered = prev.filter((s) => s.peerId !== peerId);
          return [...filtered, { peerId, stream }];
        });
      },
      (peerId) => {
        setRemoteStreams((prev) => prev.filter((s) => s.peerId !== peerId));
      }
    );
    managerRef.current = manager;

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [socket]);

  const startLocalStream = useCallback(
    async (constraints: MediaStreamConstraints = { video: true, audio: true }) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalStream(stream);
        await managerRef.current?.setLocalStream(stream);
        return stream;
      } catch (err) {
        console.error("[WebRTC] Failed to get local stream:", err);
        throw err;
      }
    },
    []
  );

  const connectToPeer = useCallback(async (peerId: string) => {
    await managerRef.current?.createOffer(peerId);
  }, []);

  const removePeer = useCallback((peerId: string) => {
    managerRef.current?.removePeer(peerId);
    setRemoteStreams((prev) => prev.filter((s) => s.peerId !== peerId));
  }, []);

  const stopLocalStream = useCallback(() => {
    localStream?.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
  }, [localStream]);

  return {
    localStream,
    remoteStreams,
    startLocalStream,
    stopLocalStream,
    connectToPeer,
    removePeer,
  };
}
