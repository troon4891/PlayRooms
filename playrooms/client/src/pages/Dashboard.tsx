import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, ExternalLink, Settings, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { rooms, health, type Room } from "../lib/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { t: tr } = useTranslation("room");
  const [roomList, setRoomList] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [buttplugConnected, setButtplugConnected] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAccessMode, setNewAccessMode] = useState<"open" | "challenge">("open");
  const [newMaxGuests, setNewMaxGuests] = useState(4);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [roomData, healthData] = await Promise.all([rooms.list(), health()]);
      setRoomList(roomData);
      setButtplugConnected(healthData.buttplug);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const room = await rooms.create({
        name: newName.trim(),
        accessMode: newAccessMode,
        maxGuests: newMaxGuests,
        widgets: [
          { type: "toybox", enabled: true, settings: {} },
          { type: "textchat", enabled: true, settings: {} },
        ],
      });
      setRoomList((prev) => [...prev, room]);
      setShowCreate(false);
      setNewName("");
      navigate(`/room/${room.id}`);
    } catch (err) {
      console.error("Failed to create room:", err);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(tr("deleteConfirm"))) return;
    try {
      await rooms.delete(id);
      setRoomList((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Failed to delete room:", err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-lg">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{t("appName")}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm">
            {buttplugConnected ? (
              <span className="flex items-center gap-1 text-green-400">
                <Wifi className="w-4 h-4" /> {t("buttplugConnected")}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-yellow-400">
                <WifiOff className="w-4 h-4" /> {t("buttplugDisconnected")}
              </span>
            )}
          </div>
        </div>
        <Link to="/settings" className="btn-secondary flex items-center gap-2">
          <Settings className="w-4 h-4" /> {t("settings")}
        </Link>
      </header>

      <div className="mb-6">
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {tr("newRoom")}
        </button>
      </div>

      {showCreate && (
        <div className="card mb-6">
          <h2 className="text-xl font-semibold mb-4">{tr("createPlayRoom")}</h2>
          <div className="space-y-4">
            <div>
              <label className="label">{tr("roomName")}</label>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={tr("roomNamePlaceholder")}
                autoFocus
              />
            </div>
            <div>
              <label className="label">{tr("accessMode")}</label>
              <select
                className="input"
                value={newAccessMode}
                onChange={(e) => setNewAccessMode(e.target.value as "open" | "challenge")}
              >
                <option value="open">{tr("accessModeOpen")}</option>
                <option value="challenge">{tr("accessModeChallenge")}</option>
              </select>
            </div>
            <div>
              <label className="label">{tr("maxGuests")}</label>
              <input
                className="input"
                type="number"
                min={1}
                max={4}
                value={newMaxGuests}
                onChange={(e) => setNewMaxGuests(Number(e.target.value))}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={handleCreate} className="btn-primary">{t("create")}</button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary">{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {roomList.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          <p className="text-lg">{tr("noRoomsYet")}</p>
          <p className="text-sm mt-1">{tr("noRoomsHint")}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {roomList.map((room) => (
            <div key={room.id} className="card flex items-center justify-between">
              <div>
                <Link to={`/room/${room.id}`} className="text-lg font-semibold hover:text-primary-400 transition-colors">
                  {room.name}
                </Link>
                <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                  <span className="capitalize">{tr("openAccess", { mode: room.accessMode })}</span>
                  <span>{tr("maxGuestsCount", { count: room.maxGuests })}</span>
                  <span>{tr("widgetCount", { count: room.widgets.filter((w) => w.enabled).length })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/room/${room.id}`} className="btn-secondary p-2" title={tr("openRoom")}>
                  <ExternalLink className="w-4 h-4" />
                </Link>
                <button onClick={() => handleDelete(room.id)} className="btn-danger p-2" title={tr("deleteRoom")}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
