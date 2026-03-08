import { useState, useEffect, useRef } from "react";
import { Video, VideoOff } from "lucide-react";
import type { Socket } from "socket.io-client";
import { useWebRTC } from "../../hooks/useWebRTC";

interface VideoChatProps {
  socket: Socket | null;
}

export default function VideoChat({ socket }: VideoChatProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const { remoteStreams, startLocalStream, stopLocalStream } = useWebRTC(socket);
  const [joined, setJoined] = useState(false);

  async function handleJoin() {
    try {
      const stream = await startLocalStream({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setJoined(true);
    } catch (err) {
      console.error("Failed to join video chat:", err);
    }
  }

  function handleLeave() {
    stopLocalStream();
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setJoined(false);
  }

  // Grid layout based on participant count
  const totalParticipants = (joined ? 1 : 0) + remoteStreams.length;
  const gridClass = totalParticipants <= 1
    ? "grid-cols-1"
    : totalParticipants <= 2
    ? "grid-cols-2"
    : "grid-cols-2 grid-rows-2";

  return (
    <div className="card h-full">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Video className="w-5 h-5 text-primary-400" /> Video Chat
      </h3>

      {!joined ? (
        <div className="flex flex-col items-center justify-center py-8">
          <Video className="w-12 h-12 text-slate-500 mb-4" />
          <button onClick={handleJoin} className="btn-primary flex items-center gap-2">
            <Video className="w-4 h-4" /> Join Video Chat
          </button>
        </div>
      ) : (
        <>
          {/* Video Grid */}
          <div className={`grid gap-2 ${gridClass}`}>
            {/* Local video */}
            <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
              />
              <span className="absolute bottom-1 left-2 text-xs bg-black/60 px-2 py-0.5 rounded">
                You
              </span>
            </div>

            {/* Remote videos */}
            {remoteStreams.map((remote) => (
              <RemoteVideo key={remote.peerId} stream={remote.stream} peerId={remote.peerId} />
            ))}
          </div>

          <div className="mt-3">
            <button onClick={handleLeave} className="btn-danger flex items-center gap-2 text-sm">
              <VideoOff className="w-4 h-4" /> Leave Video
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RemoteVideo({ stream, peerId }: { stream: MediaStream; peerId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <span className="absolute bottom-1 left-2 text-xs bg-black/60 px-2 py-0.5 rounded">
        {peerId}
      </span>
    </div>
  );
}
