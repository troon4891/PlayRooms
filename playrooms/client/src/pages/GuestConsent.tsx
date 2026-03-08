import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";

interface GuestConsentProps {
  onAccept: () => void;
}

export default function GuestConsent({ onAccept }: GuestConsentProps) {
  const { t } = useTranslation("consent");

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card max-w-md w-full text-center">
        <ShieldCheck className="w-10 h-10 text-primary-400 mx-auto mb-4" />

        <h2 className="text-xl font-bold mb-4">{t("guestLobby.title")}</h2>

        <p className="text-sm text-slate-300 mb-3">
          {t("guestLobby.body")}
        </p>

        <p className="text-sm text-slate-300 mb-3">
          {t("guestLobby.detail")}
        </p>

        <p className="text-sm text-slate-400 mb-6">
          {t("guestLobby.leave")}
        </p>

        <button onClick={onAccept} className="btn-primary w-full">
          {t("guestLobby.accept")}
        </button>
      </div>
    </div>
  );
}
