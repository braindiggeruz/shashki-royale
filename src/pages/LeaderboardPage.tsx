import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronLeft, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchLeaderboard, type Profile } from "../services/profiles.ts";
import { useProfile } from "../hooks/use-profile.ts";
import { supabaseConfigured } from "../lib/supabase.ts";
import { getTierInfo, getWinRate } from "../lib/rating.ts";

const AVATARS = ["♟", "♛", "⚔️", "🛡️", "🦁", "🐺", "🔥", "🌙"];

type SortKey = "rating" | "wins" | "total_games";

const ROYAL_BG = {
  background:
    "radial-gradient(ellipse at 50% 0%, rgba(120,50,0,0.35) 0%, transparent 60%), linear-gradient(180deg, #0d0400 0%, #1a0800 50%, #0d0400 100%)",
};

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile: myProfile } = useProfile();
  const [players, setPlayers] = useState<(Profile | Omit<Profile, "player_id">)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("rating");

  useEffect(() => {
    if (!supabaseConfigured) { setIsLoading(false); return; }
    fetchLeaderboard()
      .then(setPlayers)
      .catch(() => setPlayers([]))
      .finally(() => setIsLoading(false));
  }, []);

  const sorted = [...players].sort((a, b) => b[sortKey] - a[sortKey]);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "rating", label: t("byRating") },
    { key: "wins", label: t("byWins") },
    { key: "total_games", label: t("byGames") },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={ROYAL_BG}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/5">
        <button
          onClick={() => navigate("/")}
          className="p-2 rounded-xl cursor-pointer"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: "rgba(200,150,50,0.8)" }} />
        </button>
        <h1
          className="text-base font-bold tracking-widest uppercase"
          style={{ fontFamily: "Cinzel, serif", color: "#ffd700" }}
        >
          {t("topPlayers")}
        </h1>
        <div className="flex-1" />
        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl cursor-pointer text-xs font-semibold"
          style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)", color: "rgba(200,150,50,0.8)", fontFamily: "Cinzel, serif" }}
        >
          <User className="w-3.5 h-3.5" />
          {t("profile")}
        </button>
      </div>

      {/* Sort tabs */}
      <div className="flex gap-2 px-4 py-3 border-b border-white/5">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortKey(opt.key)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all"
            style={{
              background: sortKey === opt.key ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.04)",
              border: sortKey === opt.key ? "1px solid rgba(255,215,0,0.4)" : "1px solid rgba(255,255,255,0.08)",
              color: sortKey === opt.key ? "#ffd700" : "rgba(200,150,50,0.5)",
              fontFamily: "Cinzel, serif",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!supabaseConfigured ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">⚙️</p>
            <p className="text-sm" style={{ color: "rgba(200,150,50,0.5)" }}>
              Supabase не настроен
            </p>
          </div>
        ) : isLoading ? (
          <LoadingSkeleton />
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🏆</p>
            <p className="text-sm" style={{ color: "rgba(200,150,50,0.5)" }}>
              Пока нет игроков
            </p>
          </div>
        ) : (
          <>
            {/* Top-3 Podium */}
            {top3.length >= 3 && (
              <Podium top3={top3} myProfileId={myProfile?.id ?? null} t={t} />
            )}

            {/* Rest of list */}
            <div className="px-4 py-3 space-y-1 pb-6">
              {rest.map((player, idx) => {
                const rank = idx + 4;
                const isMe = myProfile?.id === player.id;
                const tierInfo = getTierInfo(player.rating);
                const winRate = getWinRate(player.wins, player.total_games);

                return (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: isMe ? "rgba(255,215,0,0.07)" : "rgba(255,255,255,0.02)",
                      border: isMe ? "1px solid rgba(255,215,0,0.25)" : "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    {/* Rank */}
                    <div className="w-7 text-center shrink-0">
                      <span className="text-sm" style={{ color: "rgba(200,150,50,0.4)" }}>
                        {rank}
                      </span>
                    </div>

                    {/* Avatar + tier badge */}
                    <div className="relative shrink-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                        style={{ background: "rgba(180,130,0,0.12)", border: `1px solid ${tierInfo.color}33` }}
                      >
                        {AVATARS[player.avatar_index] ?? "♟"}
                      </div>
                      <div
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-md flex items-center justify-center text-[9px]"
                        style={{ background: tierInfo.glow, border: `1px solid ${tierInfo.color}55` }}
                      >
                        {tierInfo.icon}
                      </div>
                    </div>

                    {/* Name + stats */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: isMe ? "#ffd700" : "rgba(220,180,80,0.9)", fontFamily: "Cinzel, serif" }}
                      >
                        {player.nickname}
                        {isMe && (
                          <span className="ml-1 text-xs" style={{ color: "rgba(200,150,50,0.5)" }}>
                            ({t("you")})
                          </span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: "rgba(200,150,50,0.35)" }}>
                        {player.total_games} игр • {winRate}% побед
                      </p>
                    </div>

                    {/* Rating + tier */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold" style={{ color: tierInfo.color }}>{player.rating}</p>
                      <p className="text-xs" style={{ color: "rgba(200,150,50,0.35)" }}>{tierInfo.label}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Podium({
  top3,
  myProfileId,
  t,
}: {
  top3: (Profile | Omit<Profile, "player_id">)[];
  myProfileId: string | null;
  t: (k: string) => string;
}) {
  // Podium order: 2nd, 1st, 3rd
  const order = [top3[1], top3[0], top3[2]];
  const heights = ["h-20", "h-28", "h-16"];
  const ranks = [2, 1, 3];
  const medals = ["🥈", "🥇", "🥉"];
  const scales = [0.9, 1, 0.85];

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-end justify-center gap-2">
        {order.map((player, i) => {
          if (!player) return null;
          const isMe = myProfileId === player.id;
          const tierInfo = getTierInfo(player.rating);
          const rank = ranks[i];

          return (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 + 0.1, duration: 0.5 }}
              className="flex flex-col items-center flex-1 max-w-[110px]"
              style={{ transform: `scale(${scales[i]})`, transformOrigin: "bottom center" }}
            >
              {/* Player card above podium */}
              <div className="flex flex-col items-center mb-2 gap-1">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                  style={{
                    background: `radial-gradient(circle, ${tierInfo.glow} 0%, rgba(255,255,255,0.03) 80%)`,
                    border: isMe ? `2px solid ${tierInfo.color}` : `1px solid ${tierInfo.color}55`,
                    boxShadow: rank === 1 ? `0 0 16px ${tierInfo.glow}` : "none",
                  }}
                >
                  {AVATARS[player.avatar_index] ?? "♟"}
                </div>
                <p
                  className="text-xs font-bold text-center truncate w-full px-1"
                  style={{ color: rank === 1 ? "#ffd700" : "rgba(220,180,80,0.8)", fontFamily: "Cinzel, serif" }}
                >
                  {player.nickname}
                  {isMe && " ✦"}
                </p>
                <p className="text-xs" style={{ color: tierInfo.color }}>{player.rating} ★</p>
              </div>

              {/* Podium block */}
              <div
                className={`w-full ${heights[i]} rounded-t-xl flex flex-col items-center justify-start pt-2 gap-1`}
                style={{
                  background: rank === 1
                    ? "linear-gradient(180deg, rgba(255,215,0,0.2) 0%, rgba(255,215,0,0.08) 100%)"
                    : rank === 2
                    ? "linear-gradient(180deg, rgba(192,192,192,0.15) 0%, rgba(192,192,192,0.06) 100%)"
                    : "linear-gradient(180deg, rgba(205,127,50,0.15) 0%, rgba(205,127,50,0.06) 100%)",
                  border: rank === 1
                    ? "1px solid rgba(255,215,0,0.25)"
                    : "1px solid rgba(255,255,255,0.08)",
                  borderBottom: "none",
                }}
              >
                <span className="text-xl">{medals[i]}</span>
                <span
                  className="text-xs font-bold"
                  style={{
                    color: rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : "#cd7f32",
                    fontFamily: "Cinzel, serif",
                  }}
                >
                  #{rank}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-1 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
      ))}
    </div>
  );
}
