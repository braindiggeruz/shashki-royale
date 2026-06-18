import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "../hooks/use-profile";
import { usePlayerId } from "../hooks/usePlayerId";
import { fetchStakeTables, createStakeGame, joinStakeGame } from "../services/stakes";
import { saveActiveGame } from "../lib/storage";
import { createInitialBoard } from "../game/initialBoard";
import { supabaseConfigured } from "../lib/supabase";

/**
 * Quick stake amounts (in Coin).
 * NOTE: DB constraint requires entry_fee >= 10. We use 10/25/50/100/250
 * so no migration is needed and full Coin/QuickMatch flow works end-to-end.
 */
export const QUICK_STAKES = [10, 25, 50, 100, 250] as const;
export type QuickStake = (typeof QUICK_STAKES)[number];

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function GoldCoin({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ filter: "drop-shadow(0 0 4px rgba(255,215,0,0.5))", flexShrink: 0 }}
    >
      <defs>
        <radialGradient id="qsb-gc" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FFE566" />
          <stop offset="50%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#B8860B" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#qsb-gc)" stroke="#D4AF37" strokeWidth="0.8" />
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#7a5200" fontFamily="serif">
        ₡
      </text>
    </svg>
  );
}

type StakeTable = {
  id: string;
  room_code: string;
  status: string;
  match_type: string;
  white_profile_id: string | null;
  game_stakes: { entry_fee: number; pot_amount: number; escrow_status: string }[] | null;
};

export default function QuickStakeBar() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile, wallet, refresh: refreshProfile } = useProfile();
  const { playerId, isAuthenticated } = usePlayerId();
  const [busyStake, setBusyStake] = useState<QuickStake | null>(null);

  const balance = wallet?.crypto_balance ?? 0;

  const startQuickMatch = async (stake: QuickStake) => {
    if (!supabaseConfigured) {
      toast.error(t("supabaseNotConfigured", { defaultValue: "Онлайн недоступен" }));
      return;
    }
    if (!isAuthenticated) {
      // Send user to login, then come back
      toast.info(t("loginRequired", { defaultValue: "Войдите, чтобы играть на Coin" }));
      navigate("/auth/login");
      return;
    }
    if (balance < stake) {
      toast.error(t("notEnoughCoins", { defaultValue: "Недостаточно Coin для этой ставки" }), {
        style: {
          background: "#2a0a00",
          border: "1px solid rgba(220,50,50,0.5)",
          color: "#ffd700",
          fontFamily: "Cinzel, serif",
        },
      });
      return;
    }

    setBusyStake(stake);
    try {
      // 1) Try to find an existing waiting table with exactly this stake
      //    that isn't created by me.
      const tables = (await fetchStakeTables()) as unknown as StakeTable[];
      const candidate = tables.find((t) => {
        const fee = t.game_stakes?.[0]?.entry_fee ?? 0;
        const isMine = profile?.id && t.white_profile_id === profile.id;
        return fee === stake && t.status === "waiting" && !isMine;
      });

      if (candidate) {
        const result = await joinStakeGame(playerId, candidate.id);
        if (result.error) throw new Error(result.error);
        saveActiveGame({
          gameId: candidate.id,
          roomCode: candidate.room_code,
          playerId,
          playerColor: "black",
          savedAt: Date.now(),
        });
        await refreshProfile();
        toast.success(`⚔️ ${t("opponentFound", { defaultValue: "Соперник найден!" })} (${stake} Coin)`, {
          style: { background: "#0d2200", border: "1px solid rgba(100,200,50,0.4)", color: "#90ee90" },
        });
        navigate("/online-game", { state: { gameId: candidate.id, myColor: "black" } });
        return;
      }

      // 2) No match found — create a new waiting table with this stake.
      const roomCode = generateRoomCode();
      const board = createInitialBoard();
      const result = await createStakeGame(playerId, stake, roomCode, board);
      if (result.error) throw new Error(result.error);
      saveActiveGame({
        gameId: result.game_id,
        roomCode: result.room_code,
        playerId,
        playerColor: "white",
        savedAt: Date.now(),
      });
      await refreshProfile();
      toast.success(`♛ ${t("searchingOpponent", { defaultValue: "Ищем соперника..." })} (${stake} Coin)`, {
        style: { background: "#0d2200", border: "1px solid rgba(100,200,50,0.4)", color: "#90ee90" },
      });
      navigate("/online-game", { state: { gameId: result.game_id, myColor: "white" } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка";
      toast.error(`${t("error", { defaultValue: "Ошибка" })}: ${msg}`, {
        style: {
          background: "#2a0a00",
          border: "1px solid rgba(220,50,50,0.5)",
          color: "#ffd700",
          fontFamily: "Cinzel, serif",
        },
      });
    } finally {
      setBusyStake(null);
    }
  };

  return (
    <motion.div
      data-testid="quick-stake-bar"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.5 }}
      className="w-full max-w-sm rounded-2xl px-3 py-3"
      style={{
        background:
          "linear-gradient(135deg, rgba(184,134,11,0.10) 0%, rgba(255,215,0,0.04) 100%)",
        border: "1px solid rgba(255,215,0,0.18)",
        boxShadow: "0 0 24px rgba(212,175,55,0.06)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" style={{ color: "#FFD700" }} />
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
          >
            {t("quickMatch", { defaultValue: "Быстрый матч" })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <GoldCoin size={12} />
          <span
            className="text-xs font-black"
            style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
            data-testid="qsb-balance"
          >
            {balance.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Stake buttons — horizontal scroll on tight screens */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 quick-stake-row"
        style={{ scrollbarWidth: "none" as const, WebkitOverflowScrolling: "touch" }}
      >
        {QUICK_STAKES.map((stake) => {
          const affordable = balance >= stake;
          const isBusy = busyStake === stake;
          const disabled = !affordable || isBusy || busyStake !== null;
          return (
            <button
              key={stake}
              type="button"
              data-testid={`qsb-stake-${stake}`}
              onClick={() => void startQuickMatch(stake)}
              disabled={disabled}
              className="flex-1 min-w-[56px] flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              style={{
                background: !affordable
                  ? "rgba(255,255,255,0.03)"
                  : isBusy
                  ? "rgba(255,215,0,0.28)"
                  : "linear-gradient(135deg, rgba(184,134,11,0.22) 0%, rgba(255,215,0,0.12) 100%)",
                border: !affordable
                  ? "1px solid rgba(255,255,255,0.06)"
                  : "1px solid rgba(255,215,0,0.45)",
                color: !affordable ? "rgba(200,150,50,0.35)" : "#FFD700",
                boxShadow: affordable && !isBusy ? "0 2px 10px rgba(180,140,0,0.18)" : "none",
                minHeight: 44,
              }}
            >
              <GoldCoin size={14} />
              <span
                className="text-sm font-black leading-none"
                style={{ fontFamily: "Cinzel, serif" }}
              >
                {stake}
              </span>
            </button>
          );
        })}
      </div>

      {/* Helper text */}
      <p
        className="text-[10px] text-center mt-1.5 leading-snug"
        style={{ color: "rgba(212,175,55,0.55)" }}
      >
        {t("quickMatchHint", {
          defaultValue: "Тыкни на сумму — мы автоматически найдём тебе соперника",
        })}
      </p>
    </motion.div>
  );
}
