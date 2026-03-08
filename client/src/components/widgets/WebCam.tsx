import { useState, useEffect, useRef } from "react";
import { Camera, CameraOff } from "lucide-react";
import type { Socket } from "socket.io-client";
import { useWebRTC } from "../../hooks/useWebRTC";

interface WebCamProps {
  socket: Socket | null;
  isHost?: boolean;
}

export default function WebCam({ socket, isHost = false }: WebCamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { remoteStreams, startLocalStream, stopLocalStream } = useWebRTC(socket);
  const [streaming, setStreaming] = useState(false);

  // Host: start webcam and broadcast
  async function handleStartStream() {
    try {
      const stream = await startLocalStream({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStreaming(true);
    } catch (err) {
      console.error("Failed to start webcam:", err);
    }
  }

  function handleStopStream() {
    stopLocalStream();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  }

  // Guest: display the first remote stream (host's webcam)
  useEffect(() => {
    if (!isHost && remoteStreams.length > 0 && videoRef.current) {
      videoRef.current.srcObject = remoteStreams[0].stream;
    }
  }, [isHost, remoteStreams]);

  return (
    <div className="card h-full">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Camera className="w-5 h-5 text-primary-400" /> Web Cam
      </h3>

      <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isHost}
          className="w-full h-full object-cover"
        />

        {!streaming && isHost && remoteStreams.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <CameraOff className="w-8 h-8" />
          </div>
        )}

        {!isHost && remoteStreams.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <p className="text-sm">Waiting for host camera...</p>
          </div>
        )}
      </div>

      {isHost && (
        <div className="mt-3">
          {streaming ? (
            <button onClick={handleStopStream} className="btn-danger flex items-center gap-2 text-sm">
              <CameraOff className="w-4 h-4" /> Stop Camera
            </button>
          ) : (
            <button onClick={handleStartStream} className="btn-primary flex items-center gap-2 text-sm">
              <Camera className="w-4 h-4" /> Start Camera
            </button>
          )}
        </div>
      )}
    </div>
  );
}
