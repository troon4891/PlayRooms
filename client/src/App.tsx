import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import RoomHost from "./pages/RoomHost";
import RoomGuest from "./pages/RoomGuest";
import Lobby from "./pages/Lobby";
import Settings from "./pages/Settings";
import Disclaimer from "./pages/Disclaimer";
import { basePath } from "./lib/ingress";
import { apiBase } from "./lib/api";

interface DisclaimerStatus {
  accepted: boolean;
  version: string | null;
  acceptedAt: number | null;
  updateAvailable: boolean;
}

function AdminApp() {
  const [disclaimerStatus, setDisclaimerStatus] = useState<DisclaimerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkDisclaimer();
  }, []);

  async function checkDisclaimer() {
    try {
      const res = await fetch(`${apiBase}/disclaimer/status`);
      const data: DisclaimerStatus = await res.json();
      setDisclaimerStatus(data);
    } catch {
      // If we can't reach the server, skip disclaimer check (will show on retry)
      setDisclaimerStatus({ accepted: true, version: null, acceptedAt: null, updateAvailable: false });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (disclaimerStatus && !disclaimerStatus.accepted) {
    return (
      <Disclaimer
        updateAvailable={disclaimerStatus.updateAvailable}
        onAccepted={() => setDisclaimerStatus({ ...disclaimerStatus, accepted: true })}
      />
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/room/:id" element={<RoomHost />} />
      <Route path="/join/:token" element={<Lobby />} />
      <Route path="/room/:id/guest" element={<RoomGuest />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={basePath}>
      <AdminApp />
    </BrowserRouter>
  );
}
