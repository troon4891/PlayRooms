import { useState, useEffect } from "react";
import { useParams, useLocation, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { rooms, type Room } from "../lib/api";
import { useSocket } from "../hooks/useSocket";
import { useButtplug } from "../hooks/useButtplug";
import ToyBox from "../components/widgets/ToyBox";
import TextChat from "../components/widgets/TextChat";
import WebCam from "../components/widgets/WebCam";
import VideoChat from "../components/widgets/VideoChat";
import VoiceChat from "../components/widgets/VoiceChat";
import RoomLayout from "../components/room/RoomLayout";

export default function RoomGuest() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { t } = useTranslation();
  const { t: tr } = useTranslation("room");
  const state = location.state as { token?: string; name?: string; code?: string } | null;

  const [room, setRoom] = useState<Room | null>(null);
  const [approved, setApproved] = useState(false);
  const [waiting, setWaiting] = useState(false);

  // Redirect if no state (user navigated directly without going through lobby)
  if (!state?.token || !state?.name) {
    return <Navigate to="/" replace />;
  }

  const { socket, connected } = useSocket({
    roomId: id!,
    token: state.token,
    name: state.name,
  });
  const { devices, sendCommand } = useButtplug(socket);

  useEffect(() => {
    // Fetch room info for widget layout
    if (id) {
      rooms.get(id).then(setRoom).catch(console.error);
    }
  }, [id]);

  useEffect(() => {
    if (!socket) return;

    const handleApproved = () => {
      setApproved(true);
      setWaiting(false);
    };

    // If there's a code, submit it
    if (state?.code) {
      socket.emit("guest:join", { token: state.token!, name: state.name!, code: state.code });
      setWaiting(true);
    }

    socket.on("guest:approved", handleApproved);

    return () => {
      socket.off("guest:approved", handleApproved);
    };
  }, [socket, state]);

  // Auto-approve for open rooms (server handles this, we just detect it)
  useEffect(() => {
    if (connected && !approved) {
      // Give the server a moment to process
      const timer = setTimeout(() => {
        if (!waiting) setApproved(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [connected, approved, waiting]);

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> {t("connecting")}
        </div>
      </div>
    );
  }

  if (waiting && !approved) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card text-center max-w-md w-full">
          <Loader2 className="w-12 h-12 text-primary-400 mx-auto mb-4 animate-spin" />
          <h2 className="text-xl font-bold mb-2">{tr("waitingForApproval")}</h2>
          <p className="text-slate-400">{tr("waitingHint")}</p>
        </div>
      </div>
    );
  }

  const enabledWidgets = room?.widgets.filter((w) => w.enabled) ?? [];

  return (
    <div className="min-h-screen p-4">
      <header className="mb-4">
        <h1 className="text-xl font-bold">{room?.name ?? tr("playRoom")}</h1>
        <p className="text-sm text-slate-400">{tr("joinedAs", { name: state.name })}</p>
      </header>

      <RoomLayout>
        {enabledWidgets.map((widget) => {
          switch (widget.type) {
            case "toybox":
              return <ToyBox key="toybox" devices={devices} onCommand={sendCommand} isHost={false} />;
            case "textchat":
              return <TextChat key="textchat" socket={socket} senderName={state.name!} />;
            case "webcam":
              return <WebCam key="webcam" socket={socket} isHost={false} />;
            case "videochat":
              return <VideoChat key="videochat" socket={socket} />;
            case "voicechat":
              return <VoiceChat key="voicechat" socket={socket} />;
            default:
              return null;
          }
        })}
      </RoomLayout>
    </div>
  );
}
