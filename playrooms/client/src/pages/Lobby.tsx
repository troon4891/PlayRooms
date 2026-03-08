import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LogIn, Lock, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { share, type RoomPublicInfo } from "../lib/api";
import GuestConsent from "./GuestConsent";

export default function Lobby() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("room");
  const [roomInfo, setRoomInfo] = useState<RoomPublicInfo | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [consentGiven, setConsentGiven] = useState(false);

  useEffect(() => {
    validateLink();
  }, [token]);

  async function validateLink() {
    if (!token) return;
    try {
      const info = await share.validate(token);
      setRoomInfo(info);
    } catch {
      setError(t("linkExpired"));
    } finally {
      setLoading(false);
    }
  }

  function handleJoin() {
    if (!name.trim() || !roomInfo || !token) return;

    // Navigate to guest room view with token and name in state
    navigate(`/room/${roomInfo.id}/guest`, {
      state: { token, name: name.trim(), code: code || undefined },
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">{t("validatingLink")}</div>
      </div>
    );
  }

  if (error || !roomInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card text-center max-w-md w-full">
          <Lock className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">{t("linkInvalid")}</h1>
          <p className="text-slate-400">{error || t("linkInvalidHint")}</p>
        </div>
      </div>
    );
  }

  // Guest consent screen — always shown before room join (not stored persistently)
  if (!consentGiven) {
    return <GuestConsent onAccept={() => setConsentGiven(true)} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">{roomInfo.name}</h1>
          <div className="flex items-center justify-center gap-3 mt-2 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" /> {t("upToGuests", { count: roomInfo.maxGuests })}
            </span>
            <span className="capitalize">{t("openAccess", { mode: roomInfo.accessMode })}</span>
          </div>
          <div className="flex gap-2 justify-center mt-2">
            {roomInfo.widgets.map((w) => (
              <span key={w} className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-xs capitalize">
                {w}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">{t("yourName")}</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("yourNamePlaceholder")}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </div>

          {roomInfo.accessMode === "challenge" && roomInfo.challengeType === "code" && (
            <div>
              <label className="label">{t("accessCode")}</label>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("accessCodePlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={!name.trim()}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {roomInfo.accessMode === "challenge" ? t("requestAccess") : t("joinRoom")}
          </button>
        </div>
      </div>
    </div>
  );
}
