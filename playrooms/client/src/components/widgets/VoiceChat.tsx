import { useState, useEffect, useCallback } from "react";
import { Mic, MicOff, Radio } from "lucide-react";
import type { Socket } from "socket.io-client";
import { useWebRTC } from "../../hooks/useWebRTC";

interface VoiceChatProps {
  socket: Socket | null;
}

export default function VoiceChat({ socket }: VoiceChatProps) {
  const { localStream, startLocalStream, stopLocalStream } = useWebRTC(socket);
  const [joined, setJoined] = useState(false);
  const [mode, setMode] = useState<"ptt" | "open">("ptt");
  const [pttActive, setPttActive] = useState(false);
  const [muted, setMuted] = useState(true);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;

    const handlePttStart = (data: { guestId: string }) => {
      setActiveSpeakers((prev) => new Set(prev).add(data.guestId));
    };

    const handlePttEnd = (data: { guestId: string }) => {
      setActiveSpeakers((prev) => {
        const next = new Set(prev);
        next.delete(data.guestId);
        return next;
      });
    };

    socket.on("voice:ptt-start", handlePttStart);
    socket.on("voice:ptt-end", handlePttEnd);

    return () => {
      socket.off("voice:ptt-start", handlePttStart);
      socket.off("voice:ptt-end", handlePttEnd);
    };
  }, [socket]);

  async function handleJoin() {
    try {
      await startLocalStream({ video: false, audio: true });
      setJoined(true);
      // Start muted
      setMuted(true);
      muteLocalAudio(true);
    } catch (err) {
      console.error("Failed to join voice chat:", err);
    }
  }

  function handleLeave() {
    stopLocalStream();
    setJoined(false);
    setMuted(true);
    setPttActive(false);
  }

  function muteLocalAudio(shouldMute: boolean) {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !shouldMute;
      });
    }
  }

  function toggleMute() {
    if (mode === "open") {
      const newMuted = !muted;
      setMuted(newMuted);
      muteLocalAudio(newMuted);
    }
  }

  const handlePttDown = useCallback(() => {
    if (mode !== "ptt" || !joined) return;
    setPttActive(true);
    muteLocalAudio(false);
    socket?.emit("voice:ptt-start");
  }, [mode, joined, socket, localStream]);

  const handlePttUp = useCallback(() => {
    if (mode !== "ptt" || !joined) return;
    setPttActive(false);
    muteLocalAudio(true);
    socket?.emit("voice:ptt-end");
  }, [mode, joined, socket, localStream]);

  return (
    <div className="card h-full">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Radio className="w-5 h-5 text-primary-400" /> Voice Chat
      </h3>

      {!joined ? (
        <div className="space-y-3">
          {/* Mode selector */}
          <div>
            <label className="label">Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("ptt")}
                className={`btn text-sm flex-1 ${mode === "ptt" ? "bg-primary-600 text-white" : "bg-slate-700 text-slate-300"}`}
              >
                Push-to-Talk
              </button>
              <button
                onClick={() => setMode("open")}
                className={`btn text-sm flex-1 ${mode === "open" ? "bg-primary-600 text-white" : "bg-slate-700 text-slate-300"}`}
              >
                Open Mic
              </button>
            </div>
          </div>

          <button onClick={handleJoin} className="btn-primary w-full flex items-center justify-center gap-2">
            <Mic className="w-4 h-4" /> Join Voice Chat
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active speakers indicator */}
          {activeSpeakers.size > 0 && (
            <div className="text-sm text-green-400 flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse" />
              {activeSpeakers.size} speaking
            </div>
          )}

          {mode === "ptt" ? (
            <button
              onMouseDown={handlePttDown}
              onMouseUp={handlePttUp}
              onMouseLeave={handlePttUp}
              onTouchStart={handlePttDown}
              onTouchEnd={handlePttUp}
              className={`w-full py-6 rounded-lg font-medium text-lg transition-colors ${
                pttActive
                  ? "bg-green-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {pttActive ? (
                <span className="flex items-center justify-center gap-2">
                  <Mic className="w-5 h-5 animate-pulse" /> Speaking...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Mic className="w-5 h-5" /> Hold to Talk
                </span>
              )}
            </button>
          ) : (
            <button
              onClick={toggleMute}
              className={`w-full py-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                muted ? "bg-slate-700 text-slate-300" : "bg-green-600 text-white"
              }`}
            >
              {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              {muted ? "Unmute" : "Mute"}
            </button>
          )}

          <button onClick={handleLeave} className="btn-danger w-full text-sm">
            Leave Voice Chat
          </button>
        </div>
      )}
    </div>
  );
}
