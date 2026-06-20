import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { RotateCcw, User, Trophy, ListChecks, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import PrimaryButton from "../components/PrimaryButton.tsx";
import DebugPanel from "../components/DebugPanel.tsx";
import QuickStakeBar from "../components/QuickStakeBar.tsx";
import { loadActiveGame, clearActiveGame, type ActiveGame } from "../lib/storage.ts";
import { fetchGame } from "../services/gameRooms.ts";
import { supabaseConfigured } from "../lib/supabase.ts";
import { useProfile } from "../hooks/use-profile.ts";
import { WalletDisplay } from "../components/WalletDisplay.tsx";
import EngagementStrip from "../components/EngagementStrip.tsx";

const SOUND_KEY = "shashki_sound_enabled";

export default function Index() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useProfile();
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return true;
    const v = localStorage.getItem(SOUND_KEY);
    return v === null ? true : v === "1";
  });

  useEffect(() => {
    const saved = loadActiveGame();
    if (saved && supabaseConfigured) setActiveGame(saved);
  }, []);

  const toggleSound = () => {
    setSoundOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleResume = async () => {
    if (!activeGame) return;
    setResumeLoading(true);
    setResumeError(null);
    try {
      const game = await fetchGame(activeGame.gameId);
      if (!game) {
        clearActiveGame();
        setActiveGame(null);
        setResumeError("Партия не найдена");
        return;
      }
      if (game.status === "finished") {
        clearActiveGame();
        setActiveGame(null);
        setResumeError("Партия уже завершена");
        return;
      }
      navigate("/online-game", {
        state: { gameId: activeGame.gameId, myColor: activeGame.playerColor },
      });
    } catch {
      setResumeError("Ошибка подключения. Проверьте интернет.");
    } finally {
      setResumeLoading(false);
    }
  };

  return (
    <div
      data-testid="home-screen"
      className="min-h-[100dvh] flex flex-col items-center px-4 sm:px-5 safe-pt safe-pb safe-px relative"
      style={{
        background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)",
        paddingTop: "max(env(safe-area-inset-top, 0px), 10px)",
        gap: "10px",
      }}
    >
      {/* Header: profile + wallet · sound + leaderboard + locale */}
      <div className="w-full max-w-sm flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => navigate("/profile")}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl cursor-pointer transition-all active:scale-95 shrink-0"
            style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.18)" }}
            data-testid="home-profile-btn"
            title={t("profile")}
          >
            <User className="w-3.5 h-3.5" style={{ color: "#D4AF37" }} />
            <span
              className="text-xs max-w-[64px] truncate"
              style={{ color: "#D4AF37", fontFamily: "Cinzel, serif" }}
            >
              {profile ? profile.nickname.slice(0, 10) : t("profile")}
            </span>
          </button>
          <WalletDisplay />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleSound}
            className="p-1.5 rounded-xl cursor-pointer active:scale-95"
            style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.18)" }}
            title={soundOn ? "Sound on" : "Sound off"}
            aria-label={soundOn ? "Sound on" : "Sound off"}
            data-testid="home-sound-btn"
          >
            {soundOn ? (
              <Volume2 className="w-4 h-4" style={{ color: "#D4AF37" }} />
            ) : (
              <VolumeX className="w-4 h-4" style={{ color: "rgba(212,175,55,0.45)" }} />
            )}
          </button>
          <button
            onClick={() => navigate("/leaderboard")}
            className="p-1.5 rounded-xl cursor-pointer active:scale-95"
            style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.18)" }}
            title={t("leaderboard")}
            data-testid="home-leaderboard-btn"
          >
            <Trophy className="w-4 h-4" style={{ color: "#D4AF37" }} />
          </button>
        </div>
      </div>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center mt-1"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          style={{ filter: "drop-shadow(0 0 16px rgba(212,175,55,0.6))" }}
        >
          <svg viewBox="0 0 80 52" width="56" height="36" className="sm:w-[72px] sm:h-[46px]">
            <defs>
              <linearGradient id="crownGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFD700" />
                <stop offset="50%" stopColor="#D4AF37" />
                <stop offset="100%" stopColor="#B8860B" />
              </linearGradient>
            </defs>
            <path d="M8 44 L14 16 L26 32 L40 4 L54 32 L66 16 L72 44 Z" fill="url(#crownGrad)" stroke="#FFE066" strokeWidth="1" />
            <rect x="8" y="40" width="64" height="10" rx="3" fill="url(#crownGrad)" stroke="#FFE066" strokeWidth="0.8" />
            <circle cx="40" cy="6" r="4" fill="#DC143C" stroke="#FFD700" strokeWidth="0.8" />
            <circle cx="14" cy="17" r="3" fill="#DC143C" stroke="#FFD700" strokeWidth="0.8" />
            <circle cx="66" cy="17" r="3" fill="#DC143C" stroke="#FFD700" strokeWidth="0.8" />
            <circle cx="28" cy="45" r="2" fill="#FFD700" />
            <circle cx="52" cy="45" r="2" fill="#FFD700" />
            <circle cx="40" cy="45" r="2.5" fill="#DC143C" />
          </svg>
        </motion.div>

        <div className="text-center mt-1">
          <h1
            className="text-3xl sm:text-4xl font-black tracking-widest uppercase leading-none"
            style={{
              fontFamily: "Cinzel, serif",
              background: "linear-gradient(180deg, #FFD700 0%, #B8860B 60%, #FFD700 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 2px 6px rgba(180,130,0,0.5))",
            }}
          >
            ШАШКИ
          </h1>
          <h1
            className="text-3xl sm:text-4xl font-black tracking-widest uppercase leading-none -mt-0.5"
            style={{
              fontFamily: "Cinzel, serif",
              background: "linear-gradient(180deg, #FFD700 0%, #B8860B 60%, #FFD700 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 2px 6px rgba(180,130,0,0.5))",
            }}
          >
            РОЯЛЬ
          </h1>
          <p
            className="text-[10px] tracking-[0.3em] uppercase mt-0.5"
            style={{ color: "rgba(212,175,55,0.6)", fontFamily: "Montserrat, sans-serif" }}
          >
            {t("subtitle", { defaultValue: "Русские шашки" })}
          </p>
        </div>
      </motion.div>

      {/* Resume banner (if any) */}
      <AnimatePresence>
        {activeGame && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            className="w-full max-w-sm overflow-hidden"
          >
            <div
              className="rounded-2xl p-3"
              style={{
                background: "rgba(212,175,55,0.06)",
                border: "1px solid rgba(212,175,55,0.25)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "rgba(212,175,55,0.6)", fontFamily: "Cinzel, serif" }}
                  >
                    Активная партия
                  </p>
                  {activeGame.roomCode && (
                    <p className="text-xs mt-0.5" style={{ color: "rgba(212,175,55,0.4)" }}>
                      <span style={{ color: "#FFD700", letterSpacing: "0.15em" }}>{activeGame.roomCode}</span>
                      {" · "}
                      <span style={{ color: activeGame.playerColor === "white" ? "#FFD700" : "#aaa" }}>
                        {activeGame.playerColor === "white" ? "белые" : "чёрные"}
                      </span>
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    clearActiveGame();
                    setActiveGame(null);
                  }}
                  className="p-1.5 cursor-pointer rounded-lg"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  title="Сбросить партию"
                >
                  <RotateCcw className="w-3.5 h-3.5" style={{ color: "rgba(212,175,55,0.5)" }} />
                </button>
              </div>
              <button
                onClick={() => void handleResume()}
                disabled={resumeLoading}
                className="w-full py-2.5 text-sm font-semibold cursor-pointer transition-all"
                style={{
                  borderRadius: "12px",
                  fontFamily: "Cinzel, serif",
                  border: "1px solid #D4AF37",
                  background: resumeLoading
                    ? "rgba(180,130,0,0.2)"
                    : "linear-gradient(135deg, #b8860b, #ffd700)",
                  color: resumeLoading ? "rgba(255,200,50,0.5)" : "#1a0800",
                }}
              >
                {resumeLoading ? "Подключение..." : "Продолжить партию"}
              </button>
              {resumeError && (
                <p className="text-xs text-center mt-1.5" style={{ color: "#ff9999" }}>
                  {resumeError}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play online — primary CTA */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <PrimaryButton onClick={() => navigate("/lobby")} variant="red">
          {t("playOnline")}
        </PrimaryButton>
      </motion.div>

      {/* Engagement strip — streak/daily/challenge (cosmetic only, 0 Coin cost) */}
      <EngagementStrip />

      {/* Quick Match (Coin) */}
      {supabaseConfigured && <QuickStakeBar />}

      {/* All tables / custom stake */}
      {supabaseConfigured && (
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          onClick={() => navigate("/stake-lobby")}
          className="w-full max-w-sm flex items-center justify-center gap-2 py-2.5 rounded-xl cursor-pointer transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(212,175,55,0.22)",
            color: "rgba(220,180,80,0.95)",
            fontFamily: "Cinzel, serif",
          }}
          data-testid="all-tables-btn"
        >
          <ListChecks className="w-4 h-4" />
          <span className="text-sm font-semibold">
            {t("allTablesCustom", { defaultValue: "Все столы / своя ставка" })}
          </span>
        </motion.button>
      )}

      {/* Secondary CTAs — natural flow, no flex push */}
      <motion.div
        data-testid="home-secondary"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="w-full max-w-sm flex flex-col gap-2"
      >
        <PrimaryButton onClick={() => navigate("/local")} variant="ghost">
          {t("playLocal")}
        </PrimaryButton>
        <PrimaryButton onClick={() => navigate("/rules")} variant="ghost">
          {t("rules")}
        </PrimaryButton>
      </motion.div>

      {/* Footer */}
      <div className="flex flex-col items-center pt-1 pb-1">
        <p className="text-[9px]" style={{ color: "rgba(212,175,55,0.25)" }}>
          © Шашки Рояль 2026 · Coin — внутренняя игровая валюта
        </p>
      </div>

      <DebugPanel realtimeConnected={false} />
    </div>
  );
}
