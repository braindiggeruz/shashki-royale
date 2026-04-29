import { motion } from "motion/react";
import type { Profile } from "../services/profiles";

const AVATARS = ["♟", "♛", "⚔️", "👑", "🎯", "⭐", "🏆", "💎"];

type PlayerCardProps = {
  profile: Profile | null;
  color: "white" | "black";
  isActive: boolean;
  timeRemaining?: number;
};

export default function PlayerCard({
  profile,
  color,
  isActive,
  timeRemaining,
}: PlayerCardProps) {
  const displayName = profile?.display_name || profile?.nickname || "Игрок";
  const avatarUrl = profile?.avatar_url;
  const avatarIndex = profile?.avatar_index ?? 0;
  const symbolAvatar = AVATARS[avatarIndex % AVATARS.length];
  const rating = profile?.rating ?? 0;

  const isWhite = color === "white";
  const bgColor = isWhite
    ? "rgba(212,175,55,0.08)"
    : "rgba(80,60,20,0.12)";
  const borderColor = isActive
    ? isWhite
      ? "rgba(212,175,55,0.5)"
      : "rgba(212,175,55,0.3)"
    : "rgba(212,175,55,0.15)";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        opacity: isActive ? 1 : 0.6,
      }}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-12 h-12 rounded-full object-cover border-2"
            style={{ borderColor: "#D4AF37" }}
            onError={(e) => {
              // Fallback to symbol if image fails
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        {!avatarUrl && (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl border-2"
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
        {/* Active indicator */}
        {isActive && (
          <motion.div
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            style={{
              background: "#4CAF50",
              border: "2px solid #fff",
              boxShadow: "0 0 8px rgba(76,175,80,0.8)",
            }}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate"
          style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
        >
          {displayName}
        </p>
        <p
          className="text-xs"
          style={{ color: "rgba(212,175,55,0.6)" }}
        >
          Рейтинг: {rating}
        </p>
      </div>

      {/* Timer (if provided) */}
      {timeRemaining !== undefined && isActive && (
        <div
          className="text-sm font-bold"
          style={{
            color: timeRemaining > 10 ? "#4CAF50" : "#FF6B6B",
          }}
        >
          {Math.ceil(timeRemaining)}s
        </div>
      )}
    </motion.div>
  );
}
