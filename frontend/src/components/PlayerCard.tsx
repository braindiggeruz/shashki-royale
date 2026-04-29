import { motion } from "motion/react";
import type { Profile } from "../services/profiles";

const AVATARS = ["♟", "♛", "⚔️", "👑", "🎯", "⭐", "🏆", "💎"];

type PlayerCardProps = {
  profile: Profile | null;
  color: "white" | "black";
  isActive: boolean;
  timeRemaining?: number;
  capturedCount?: number;
  isMe?: boolean;
};

export default function PlayerCard({
  profile,
  color,
  isActive,
  timeRemaining,
  capturedCount,
  isMe,
}: PlayerCardProps) {
  const displayName = profile?.display_name || profile?.nickname || (isMe ? "Вы" : "Соперник");
  const avatarUrl = profile?.avatar_url;
  const avatarIndex = profile?.avatar_index ?? 0;
  const symbolAvatar = AVATARS[avatarIndex % AVATARS.length];
  const rating = profile?.rating;

  const isWhite = color === "white";
  const bgColor = isActive
    ? "rgba(212,175,55,0.10)"
    : "rgba(255,255,255,0.025)";
  const borderColor = isActive
    ? "rgba(212,175,55,0.45)"
    : "rgba(212,175,55,0.12)";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      data-testid={`player-card-${color}${isMe ? "-me" : ""}`}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        opacity: isActive ? 1 : 0.7,
        transition: "background 0.25s, border-color 0.25s, opacity 0.25s",
      }}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-9 h-9 rounded-full object-cover border-2"
            style={{ borderColor: "#D4AF37" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        {!avatarUrl && (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-base border-2"
            style={{
              background: isWhite
                ? "radial-gradient(circle at 35% 35%, #FFFFFF 0%, #D4B896 100%)"
                : "radial-gradient(circle at 35% 35%, #555 0%, #000 100%)",
              borderColor: "#D4AF37",
            }}
          >
            {symbolAvatar}
          </div>
        )}
        {isActive && (
          <motion.div
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            style={{
              background: "#4CAF50",
              border: "2px solid #1a0800",
              boxShadow: "0 0 6px rgba(76,175,80,0.85)",
            }}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate leading-tight"
          style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
        >
          {displayName}
          {isMe && <span style={{ color: "rgba(212,175,55,0.55)", fontWeight: 400 }}>{" • "}{isWhite ? "белые" : "чёрные"}</span>}
        </p>
        <p className="text-[11px] leading-tight" style={{ color: "rgba(212,175,55,0.55)" }}>
          {rating !== undefined && rating !== null ? `Рейтинг: ${rating}` : (isWhite ? "Белые" : "Чёрные")}
        </p>
      </div>

      {/* Captured counter */}
      {capturedCount !== undefined && (
        <div
          className="flex flex-col items-center px-2 py-1 rounded-lg flex-shrink-0"
          style={{
            background: "rgba(212,175,55,0.08)",
            border: "1px solid rgba(212,175,55,0.18)",
            minWidth: 44,
          }}
          data-testid={`captured-count-${color}`}
        >
          <span
            className="text-[9px] uppercase tracking-wider leading-none"
            style={{ color: "rgba(212,175,55,0.55)", fontFamily: "Cinzel, serif" }}
          >
            Срубл.
          </span>
          <span
            className="text-base font-bold leading-tight"
            style={{ color: capturedCount > 0 ? "#FFD700" : "rgba(212,175,55,0.35)" }}
          >
            {capturedCount}
          </span>
        </div>
      )}

      {/* Timer */}
      {timeRemaining !== undefined && isActive && (
        <div
          className="text-sm font-bold flex-shrink-0"
          style={{ color: timeRemaining > 10 ? "#4CAF50" : "#FF6B6B" }}
        >
          {Math.ceil(timeRemaining)}s
        </div>
      )}
    </motion.div>
  );
}
