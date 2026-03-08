import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Users, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { rooms, share, type Room, type ShareLink as ShareLinkType } from "../lib/api";
import { useSocket } from "../hooks/useSocket";
import { useButtplug } from "../hooks/useButtplug";
import ToyBox from "../components/widgets/ToyBox";
import TextChat from "../components/widgets/TextChat";
import WebCam from "../components/widgets/WebCam";
import VideoChat from "../components/widgets/VideoChat";
import VoiceChat from "../components/widgets/VoiceChat";
import RoomLayout from "../components/room/RoomLayout";
import RoomConfig from "../components/room/RoomConfig";
import ShareLink from "../components/room/ShareLink";

interface Guest {
  id: string;
  name: string;
}

export default function RoomHost() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { t: tr } = useTranslation("room");
  const [room, setRoom] = useState<Room | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLinkType[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [pendingGuests, setPendingGuests] = useState<Array<{ guestId: string; name: string; code?: string }>>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(true);

  const { socket, connected } = useSocket({ roomId: id!, isHost: true });
  const { devices, sendCommand } = useButtplug(socket);

  useEffect(() => {
    loadRoom();
  }, [id]);

  useEffect(() => {
    if (!socket) return;

    const handleGuestJoined = (data: { guestId: string; name: string }) => {
      setGuests((prev) => [...prev.filter((g) => g.id !== data.guestId), { id: data.guestId, name: data.name }]);
      setPendingGuests((prev) => prev.filter((g) => g.guestId !== data.guestId));
    };

    const handleGuestLeft = (data: { guestId: string }) => {
      setGuests((prev) => prev.filter((g) => g.id !== data.guestId));
    };

    const handleLobbyPending = (data: { guestId: string; name: string; code?: string }) => {
      setPendingGuests((prev) => [...prev, data]);
    };

    const handleRoomState = (data: { guests: Guest[] }) => {
      setGuests(data.guests);
    };

    socket.on("guest:joined", handleGuestJoined);
    socket.on("guest:left", handleGuestLeft);
    socket.on("lobby:pending", handleLobbyPending);
    socket.on("room:state", handleRoomState);

    return () => {
      socket.off("guest:joined", handleGuestJoined);
      socket.off("guest:left", handleGuestLeft);
      socket.off("lobby:pending", handleLobbyPending);
      socket.off("room:state", handleRoomState);
    };
  }, [socket]);

  async function loadRoom() {
    if (!id) return;
    try {
      const [roomData, linksData] = await Promise.all([rooms.get(id), share.list(id)]);
      setRoom(roomData);
      setShareLinks(linksData);
    } catch (err) {
      console.error("Failed to load room:", err);
    } finally {
      setLoading(false);
    }
  }

  function approveGuest(guestId: string) {
    socket?.emit("lobby:approve", { guestId });
    setPendingGuests((prev) => prev.filter((g) => g.guestId !== guestId));
  }

  function rejectGuest(guestId: string) {
    socket?.emit("lobby:reject", { guestId });
    setPendingGuests((prev) => prev.filter((g) => g.guestId !== guestId));
  }

  if (loading || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">{tr("loadingRoom")}</div>
      </div>
    );
  }

  const enabledWidgets = room.widgets.filter((w) => w.enabled);

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{room.name}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className={connected ? "text-green-400" : "text-red-400"}>
                {connected ? t("connected") : t("disconnected")}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {tr("guestsCount", { current: guests.length, max: room.maxGuests })}
              </span>
            </div>
          </div>
        </div>

        <button onClick={() => setShowConfig(!showConfig)} className="btn-secondary flex items-center gap-2">
          <Settings className="w-4 h-4" /> {showConfig ? tr("closeSettings") : tr("roomSettings")}
        </button>
      </header>

      {/* Room Config Panel */}
      {showConfig && (
        <div className="mb-4">
          <RoomConfig room={room} onSave={(updated) => { setRoom(updated); setShowConfig(false); }} />
        </div>
      )}

      {/* Share Links */}
      <div className="mb-4">
        <ShareLink roomId={id!} links={shareLinks} onLinksChange={setShareLinks} />
      </div>

      {/* Pending Guests (Challenge Mode) */}
      {pendingGuests.length > 0 && (
        <div className="card mb-4 border-yellow-600">
          <h3 className="text-sm font-medium text-yellow-400 mb-2">{tr("pendingGuests")}</h3>
          <div className="space-y-2">
            {pendingGuests.map((g) => (
              <div key={g.guestId} className="flex items-center justify-between bg-slate-700 rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium">{g.name}</span>
                  {g.code && <span className="ml-2 text-sm text-slate-400">{tr("code", { code: g.code })}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveGuest(g.guestId)} className="btn-primary text-sm px-3 py-1">{tr("approve")}</button>
                  <button onClick={() => rejectGuest(g.guestId)} className="btn-danger text-sm px-3 py-1">{tr("reject")}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected Guests */}
      {guests.length > 0 && (
        <div className="card mb-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">{tr("connectedGuests")}</h3>
          <div className="flex gap-2 flex-wrap">
            {guests.map((g) => (
              <span key={g.id} className="bg-primary-600/20 text-primary-300 px-3 py-1 rounded-full text-sm">
                {g.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Widget Layout */}
      <RoomLayout>
        {enabledWidgets.map((widget) => {
          switch (widget.type) {
            case "toybox":
              return <ToyBox key="toybox" devices={devices} onCommand={sendCommand} isHost />;
            case "textchat":
              return <TextChat key="textchat" socket={socket} senderName="Host" />;
            case "webcam":
              return <WebCam key="webcam" socket={socket} isHost />;
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
