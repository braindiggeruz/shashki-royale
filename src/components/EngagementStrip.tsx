import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { readDailyLogin } from "../services/engagement.ts";
import { useProfile } from "../hooks/use-profile.ts";

/**
 * Компактная engagement-полоска для главной:
 *  • 🔥 Серия побед (win_streak, server-side)
 *  • 📅 Дней подряд в игре (daily login, localStorage)
 *  • 🎯 Прогресс ежедневного челленджа (Win 3 today)
 * Только cosmetic / motivational — никаких Coin-наград (защищает экономику).
 */
export default function EngagementStrip() {
  const { profile } = useProfile();
  const [loginDays, setLoginDays] = useState(0);

  useEffect(() => {
    const s = readDailyLogin();
    setLoginDays(s.streak);
  }, []);

  const winStreak = profile?.win_streak ?? 0;
  const bestStreak = profile?.best_win_streak ?? 0;
  const challengeWins = (() => {
    const date = profile?.daily_challenge_date;
    if (!date) return 0;
    const today = new Date().toISOString().slice(0, 10);
    return date === today ? profile?.daily_challenge_wins ?? 0 : 0;
  })();
  const challengeGoal = 3;
  const challengeDone = challengeWins >= challengeGoal;

  // Если никаких значимых данных нет — не загромождаем UI
  if (winStreak === 0 && loginDays <= 1 && challengeWins === 0) return null;

  return (
    <motion.div
      data-testid="engagement-strip"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="w-full max-w-sm flex gap-2"
    >
      {/* Win streak */}
      {winStreak > 0 && (
        <div
          data-testid="strip-win-streak"
          className="flex-1 px-2.5 py-2 rounded-xl text-center"
          style={{
            background: "rgba(255,80,0,0.10)",
            border: "1px solid rgba(255,140,0,0.35)",
          }}
          title={bestStreak > 0 ? `Рекорд: ${bestStreak}` : ""}
        >
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,160,80,0.7)", fontFamily: "Cinzel, serif" }}>
            Серия 🔥
          </div>
          <div className="text-lg font-bold leading-tight" style={{ color: "#ffb347", fontFamily: "Cinzel, serif" }}>
            {winStreak}
          </div>
        </div>
      )}

      {/* Daily login streak */}
      {loginDays >= 2 && (
        <div
          data-testid="strip-daily-login"
          className="flex-1 px-2.5 py-2 rounded-xl text-center"
          style={{
            background: "rgba(76,175,80,0.10)",
            border: "1px solid rgba(76,175,80,0.30)",
          }}
        >
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(140,200,140,0.75)", fontFamily: "Cinzel, serif" }}>
            Дней подряд
          </div>
          <div className="text-lg font-bold leading-tight" style={{ color: "#7ed87e", fontFamily: "Cinzel, serif" }}>
            {loginDays}
          </div>
        </div>
      )}

      {/* Daily challenge (Win 3 today) */}
      <div
        data-testid="strip-daily-challenge"
        className="flex-1 px-2.5 py-2 rounded-xl text-center"
        style={{
          background: challengeDone ? "rgba(212,175,55,0.18)" : "rgba(212,175,55,0.06)",
          border: challengeDone
            ? "1px solid rgba(212,175,55,0.6)"
            : "1px solid rgba(212,175,55,0.25)",
        }}
        title={challengeDone ? "Чемпион дня — выполнен!" : "Выиграй 3 партии за сегодня → титул «Чемпион дня»"}
      >
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(212,175,55,0.7)", fontFamily: "Cinzel, serif" }}>
          {challengeDone ? "Чемпион 👑" : "Цель дня"}
        </div>
        <div className="text-lg font-bold leading-tight" style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}>
          {Math.min(challengeWins, challengeGoal)}/{challengeGoal}
        </div>
      </div>
    </motion.div>
  );
}
