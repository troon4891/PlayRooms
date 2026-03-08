import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { apiBase } from "../lib/api";

interface DisclaimerProps {
  updateAvailable: boolean;
  onAccepted: () => void;
}

export default function Disclaimer({ updateAvailable, onAccepted }: DisclaimerProps) {
  const { t } = useTranslation("consent");
  const [checked, setChecked] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    if (atBottom) setScrolledToBottom(true);
  }, []);

  async function handleAccept() {
    if (!checked || !scrolledToBottom) return;
    setSubmitting(true);
    try {
      await fetch(`${apiBase}/disclaimer/accept`, { method: "POST" });
      onAccepted();
    } catch (err) {
      console.error("Failed to accept disclaimer:", err);
    } finally {
      setSubmitting(false);
    }
  }

  const points = [
    t("disclaimer.point1"),
    t("disclaimer.point2"),
    t("disclaimer.point3"),
    t("disclaimer.point4"),
    t("disclaimer.point5"),
    t("disclaimer.point6"),
    t("disclaimer.point7"),
    t("disclaimer.point8"),
    t("disclaimer.point9"),
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card max-w-2xl w-full">
        <div className="text-center mb-6">
          <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h1 className="text-2xl font-bold">{t("disclaimer.title")}</h1>
          {updateAvailable && (
            <p className="text-amber-400 text-sm mt-2">{t("disclaimer.updated")}</p>
          )}
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="bg-slate-900 rounded-lg p-4 max-h-96 overflow-y-auto mb-6 border border-slate-700"
        >
          <ol className="list-decimal list-inside space-y-4 text-sm text-slate-300">
            {points.map((point, i) => (
              <li key={i} className={i === 3 ? "text-amber-300 font-medium" : ""}>
                {point}
              </li>
            ))}
          </ol>
        </div>

        {!scrolledToBottom && (
          <p className="text-xs text-slate-500 text-center mb-3">
            {t("disclaimer.mustScroll")}
          </p>
        )}

        <label className="flex items-start gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={!scrolledToBottom}
            className="mt-0.5 w-5 h-5 rounded accent-purple-500 disabled:opacity-50"
          />
          <span className={`text-sm ${scrolledToBottom ? "text-slate-200" : "text-slate-500"}`}>
            {t("disclaimer.checkbox")}
          </span>
        </label>

        <button
          onClick={handleAccept}
          disabled={!checked || !scrolledToBottom || submitting}
          className="btn-primary w-full disabled:opacity-50"
        >
          {submitting ? "..." : t("disclaimer.accept")}
        </button>
      </div>
    </div>
  );
}
