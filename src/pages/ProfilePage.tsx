import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronLeft, Edit2, Check, X, Trophy, TrendingUp, Gamepad2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProfile, invalidateProfileCache } from "../hooks/use-profile.ts";
import { updateProfile } from "../services/profiles.ts";
import { usePlayerId } from "../hooks/usePlayerId";
import LocaleSwitcher from "../components/LocaleSwitcher.tsx";
import { supabaseConfigured } from "../lib/supabase.ts";
import { toast } from "sonner";
import { getTierInfo, getTierProgress, getWinRate } from "../lib/rating.ts";

const AVATARS = ["♟", "♛", "⚔️", "🛡️", "🦁", "🐺", "🔥", "🌙"];

const ROYAL_BG = {
  background:
    "radial-gradient(ellipse at 50% 0%, rgba(120,50,0,0.35) 0%, transparent 60%), linear-gradient(180deg, #0d0400 0%, #1a0800 50%, #0d0400 100%)",
};

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playerId } = usePlayerId();
  const { profile, wallet, isLoading, refresh } = useProfile();

  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setNickname(profile?.nickname ?? "");
    setAvatarIndex(profile?.avatar_index ?? 0);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    if (!profile) return;
    const trimmed = nickname.trim();
    if (trimmed.length < 2) { toast.error(t("nicknameMin")); return; }
    if (trimmed.length > 20) { toast.error(t("nicknameMax")); return; }

    setSaving(true);
    try {
      await updateProfile(playerId, trimmed, avatarIndex);
      invalidateProfileCache();
      await refresh();
      setEditing(false);
      toast.success(t("profileSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={ROYAL_BG}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/5">
        <button
          onClick={() => navigate("/")}
          className="p-2 rounded-xl cursor-pointer transition-all"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: "rgba(200,150,50,0.8)" }} />
        </button>
        <h1
          className="text-base font-bold tracking-widest uppercase"
          style={{ fontFamily: "Cinzel, serif", color: "#ffd700" }}
        >
          {t("profile")}
        </h1>
        <div className="flex-1" />
        <button
          onClick={() => navigate("/leaderboard")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl cursor-pointer text-xs font-semibold transition-all"
          style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)", color: "rgba(200,150,50,0.8)", fontFamily: "Cinzel, serif" }}
        >
          <Trophy className="w-3.5 h-3.5" />
          {t("leaderboard")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full space-y-4">
        {!supabaseConfigured ? (
          <NotConfigured />
        ) : isLoading ? (
          <LoadingSkeleton />
        ) : !profile ? (
          <p className="text-center text-sm" style={{ color: "rgba(200,150,50,0.5)" }}>
            {t("error")}
          </p>
        ) : (
          <>
            {/* Avatar + Nickname Card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5"
              style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.12)" }}
            >
              {editing ? (
                <EditForm
                  nickname={nickname}
                  setNickname={setNickname}
                  avatarIndex={avatarIndex}
                  setAvatarIndex={setAvatarIndex}
                  saving={saving}
                  onSave={() => void saveEdit()}
                  onCancel={cancelEdit}
                  t={t}
                />
              ) : (
                <ProfileDisplay profile={profile} wallet={wallet} onEdit={startEdit} t={t} />
              )}
            </motion.div>

            {/* Rating Tier Card */}
            <RatingTierCard rating={profile.rating} />

            {/* Stats Card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl p-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Gamepad2 className="w-4 h-4" style={{ color: "rgba(200,150,50,0.5)" }} />
                <p className="text-xs uppercase tracking-widest" style={{ color: "rgba(200,150,50,0.5)", fontFamily: "Cinzel, serif" }}>
                  {t("totalGames")}: {profile.total_games}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatBox label={t("wins")} value={profile.wins} color="#4ade80" />
                <StatBox label={t("losses")} value={profile.losses} color="#f87171" />
                <StatBox label={t("draws")} value={profile.draws} color="#fbbf24" />
              </div>

              {/* Win Rate Bar */}
              {profile.total_games > 0 && (
                <WinRateBar wins={profile.wins} losses={profile.losses} draws={profile.draws} t={t} />
              )}
            </motion.div>

            {/* Language Card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl p-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "rgba(200,150,50,0.5)", fontFamily: "Cinzel, serif" }}>
                {t("language")}
              </p>
              <LocaleSwitcher />
            </motion.div>

            {/* Virtual currency note */}
            <p className="text-xs text-center pb-4" style={{ color: "rgba(200,150,50,0.3)" }}>
              {t("chipsVirtualNote")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function RatingTierCard({ rating }: { rating: number }) {
  const tierInfo = getTierInfo(rating);
  const progress = getTierProgress(rating);
  const nextTierIndex = ["bronze", "silver", "gold", "diamond", "legend"].indexOf(tierInfo.tier) + 1;
  const tiers = ["bronze", "silver", "gold", "diamond", "legend"];
  const isMaxTier = tierInfo.tier === "legend";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl p-5"
      style={{
        background: `radial-gradient(ellipse at 30% 30%, ${tierInfo.glow} 0%, rgba(255,255,255,0.02) 70%)`,
        border: `1px solid ${tierInfo.color}33`,
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <TrendingUp className="w-4 h-4" style={{ color: "rgba(200,150,50,0.5)" }} />
        <p className="text-xs uppercase tracking-widest" style={{ color: "rgba(200,150,50,0.5)", fontFamily: "Cinzel, serif" }}>
          Ранг
        </p>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{ background: `${tierInfo.glow}`, border: `1px solid ${tierInfo.color}44` }}
        >
          {tierInfo.icon}
        </div>
        <div className="flex-1">
          <p className="text-2xl font-bold" style={{ color: tierInfo.color, fontFamily: "Cinzel, serif" }}>
            {tierInfo.label}
          </p>
          <p className="text-sm mt-0.5" style={{ color: "rgba(200,150,50,0.5)" }}>
            {rating} очков
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs" style={{ color: "rgba(200,150,50,0.4)" }}>
          <span>{tierInfo.minRating}</span>
          <span>{isMaxTier ? "MAX" : `${nextTierIndex < tiers.length ? (tierInfo.maxRating ?? 0) + 1 : "∞"}`}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${tierInfo.color}88, ${tierInfo.color})` }}
          />
        </div>
        {!isMaxTier && (
          <p className="text-xs" style={{ color: "rgba(200,150,50,0.35)" }}>
            До следующего ранга: {(tierInfo.maxRating ?? 0) + 1 - rating} очков
          </p>
        )}
      </div>
    </motion.div>
  );
}

function WinRateBar({
  wins, losses, draws, t,
}: {
  wins: number; losses: number; draws: number; t: (k: string) => string;
}) {
  const total = wins + losses + draws;
  if (total === 0) return null;
  const winPct = Math.round((wins / total) * 100);
  const drawPct = Math.round((draws / total) * 100);
  const lossPct = 100 - winPct - drawPct;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5" style={{ color: "rgba(200,150,50,0.4)" }}>
        <span>{t("wins")}: {winPct}%</span>
        <span>{t("draws")}: {drawPct}%</span>
        <span>{t("losses")}: {lossPct}%</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden flex">
        {winPct > 0 && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${winPct}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            style={{ background: "#4ade80" }}
          />
        )}
        {drawPct > 0 && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${drawPct}%` }}
            transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
            style={{ background: "#fbbf24" }}
          />
        )}
        {lossPct > 0 && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${lossPct}%` }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            style={{ background: "#f87171" }}
          />
        )}
      </div>
    </div>
  );
}

function ProfileDisplay({
  profile,
  wallet,
  onEdit,
  t,
}: {
  profile: { nickname: string; avatar_index: number; rating: number };
  wallet: { crypto_balance: number; locked_balance: number } | null;
  onEdit: () => void;
  t: (key: string) => string;
}) {
  const tierInfo = getTierInfo(profile.rating);
  const winRate = getWinRate(0, 0); // placeholder, actual computed elsewhere
  void winRate;

  return (
    <div className="flex items-start gap-4">
      <div className="relative">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0"
          style={{ background: "rgba(180,130,0,0.15)", border: `1px solid ${tierInfo.color}44` }}
        >
          {AVATARS[profile.avatar_index] ?? "♟"}
        </div>
        {/* Tier badge */}
        <div
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg flex items-center justify-center text-xs"
          style={{ background: `${tierInfo.glow}`, border: `1px solid ${tierInfo.color}66` }}
        >
          {tierInfo.icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-bold truncate" style={{ color: "#ffd700", fontFamily: "Cinzel, serif" }}>
          {profile.nickname}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: tierInfo.color }}>
          {tierInfo.label} • {profile.rating} ★
        </p>
        {wallet && (
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(74,222,128,0.08)", color: "#4ade80" }}>
              🪙 {wallet.crypto_balance} {t("tokensShort")}
            </span>
            {wallet.locked_balance > 0 && (
              <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24" }}>
                🔒 {wallet.locked_balance}
              </span>
            )}
          </div>
        )}
      </div>
      <button
        onClick={onEdit}
        className="p-2 rounded-xl cursor-pointer"
        style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.15)" }}
      >
        <Edit2 className="w-4 h-4" style={{ color: "#ffd700" }} />
      </button>
    </div>
  );
}

function EditForm({
  nickname, setNickname, avatarIndex, setAvatarIndex, saving, onSave, onCancel, t,
}: {
  nickname: string;
  setNickname: (v: string) => void;
  avatarIndex: number;
  setAvatarIndex: (v: number) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: "rgba(200,150,50,0.5)", fontFamily: "Cinzel, serif" }}>
          {t("nickname")}
        </label>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,215,0,0.2)",
            color: "#ffd700",
            fontFamily: "Cinzel, serif",
          }}
          placeholder="Player"
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-widest block mb-2" style={{ color: "rgba(200,150,50,0.5)", fontFamily: "Cinzel, serif" }}>
          {t("avatar")}
        </label>
        <div className="grid grid-cols-8 gap-1.5">
          {AVATARS.map((av, i) => (
            <button
              key={i}
              onClick={() => setAvatarIndex(i)}
              className="h-9 rounded-lg text-lg cursor-pointer transition-all"
              style={{
                background: avatarIndex === i ? "rgba(255,215,0,0.18)" : "rgba(255,255,255,0.04)",
                border: avatarIndex === i ? "1px solid rgba(255,215,0,0.5)" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {av}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-all flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #b8860b, #ffd700)", color: "#1a0800", fontFamily: "Cinzel, serif" }}
        >
          <Check className="w-4 h-4" />
          {saving ? "..." : t("save")}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm cursor-pointer"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(200,150,50,0.6)" }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: "rgba(200,150,50,0.4)" }}>{label}</p>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="text-center py-12">
      <p className="text-4xl mb-4">⚙️</p>
      <p className="text-sm" style={{ color: "rgba(200,150,50,0.6)" }}>
        Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в Secrets
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
      ))}
    </div>
  );
}
