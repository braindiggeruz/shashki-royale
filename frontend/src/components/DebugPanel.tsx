import { useState } from "react";
import { supabaseConfigured } from "../lib/supabase.ts";
import { clearActiveGame, resetPlayerId } from "../lib/storage.ts";
import type { PlayerColor } from "../game/types.ts";

type DebugPanelProps = {
  gameId?: string;
  roomCode?: string;
  myColor?: string;
  moveNumber?: number;
  currentTurn?: PlayerColor;
  realtimeConnected: boolean;
  lastUpdateTs?: number;
  pollingActive?: boolean;
  onForceRefresh?: () => Promise<void>;
};

/**
 * Hidden debug panel for production verification.
 * Activated by tapping the bottom-left corner of any screen 5 times.
 * Invisible to normal users.
 */
export default function DebugPanel({
  gameId,
  roomCode,
  myColor,
  moveNumber,
  currentTurn,
  realtimeConnected,
  lastUpdateTs,
  pollingActive,
  onForceRefresh,
}: DebugPanelProps) {
  const [taps, setTaps] = useState(0);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleTap = () => {
    const next = taps + 1;
    setTaps(next);
    if (next >= 5) {
      setOpen(true);
      setTaps(0);
    }
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const playerId = localStorage.getItem("damka_player_id") ?? "—";

  const lastUpdateDisplay = lastUpdateTs
    ? new Date(lastUpdateTs).toLocaleTimeString()
    : "—";

  const handleForceRefresh = async () => {
    if (!onForceRefresh) return;
    setRefreshing(true);
    try { await onForceRefresh(); } finally { setRefreshing(false); }
  };

  return (
    <>
      {/* Invisible tap target — bottom-left corner */}
      <button
        onClick={handleTap}
        className="fixed bottom-1 left-1 w-10 h-10 z-50 opacity-0"
        aria-label="debug"
        style={{ cursor: "default" }}
      />

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center p-3"
          style={{ background: "rgba(0,0,0,0.88)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-1.5 text-xs"
            style={{
              background: "#0d0400",
              border: "1px solid rgba(200,150,30,0.5)",
              fontFamily: "monospace",
              color: "#ffd700",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold mb-3" style={{ fontFamily: "Cinzel, serif" }}>
              🛠 Debug Panel
            </p>

            <Section label="Supabase" />
            <Row label="URL" value={supabaseUrl ? `${supabaseUrl.slice(0, 32)}…` : "❌ НЕ ЗАДАН"} />
            <Row label="Key" value={supabaseConfigured ? "✅ Настроен" : "❌ НЕ ЗАДАН"} />
            <Row label="Realtime" value={realtimeConnected ? "✅ Подключён" : "⏳ Ожидание"} />
            {pollingActive !== undefined && (
              <Row label="Polling" value={pollingActive ? "✅ Активен" : "⏹ Остановлен"} />
            )}
            {lastUpdateTs !== undefined && (
              <Row label="Last update" value={lastUpdateDisplay} />
            )}

            <div className="border-t border-white/10 pt-1 mt-2" />
            <Section label="Game" />
            <Row label="Player ID" value={`${playerId.slice(0, 18)}…`} />
            {gameId && <Row label="Game ID" value={`${gameId.slice(0, 20)}…`} />}
            {roomCode && <Row label="Room code" value={roomCode} />}
            {myColor && <Row label="My color" value={myColor} />}
            {currentTurn && <Row label="Turn" value={currentTurn} />}
            {moveNumber !== undefined && <Row label="Move #" value={String(moveNumber)} />}

            <div className="border-t border-white/10 pt-2 mt-2 space-y-2">
              {onForceRefresh && (
                <button
                  onClick={handleForceRefresh}
                  disabled={refreshing}
                  className="w-full py-2 rounded-xl text-xs cursor-pointer"
                  style={{
                    background: "rgba(0,150,100,0.15)",
                    border: "1px solid rgba(0,200,120,0.3)",
                    color: "#7dffc9",
                    opacity: refreshing ? 0.5 : 1,
                  }}
                >
                  {refreshing ? "Обновление..." : "🔄 Обновить состояние игры"}
                </button>
              )}
              <button
                onClick={() => {
                  clearActiveGame();
                  window.location.reload();
                }}
                className="w-full py-2 rounded-xl text-xs cursor-pointer"
                style={{
                  background: "rgba(150,100,0,0.2)",
                  border: "1px solid rgba(200,150,0,0.3)",
                  color: "#ffd700",
                }}
              >
                🗑 Сбросить активную партию
              </button>
              <button
                onClick={() => {
                  resetPlayerId();
                  clearActiveGame();
                  window.location.reload();
                }}
                className="w-full py-2 rounded-xl text-xs cursor-pointer"
                style={{
                  background: "rgba(180,30,0,0.2)",
                  border: "1px solid rgba(200,50,30,0.3)",
                  color: "#ff9999",
                }}
              >
                ⚠️ Сбросить Player ID (тест)
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-full py-2 rounded-xl text-xs cursor-pointer"
                style={{
                  background: "rgba(200,150,30,0.12)",
                  border: "1px solid rgba(200,150,30,0.3)",
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 leading-relaxed">
      <span style={{ color: "rgba(200,150,50,0.55)", whiteSpace: "nowrap" }}>{label}:</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return (
    <p className="text-xs uppercase tracking-widest pt-1" style={{ color: "rgba(200,150,50,0.4)" }}>
      {label}
    </p>
  );
}
