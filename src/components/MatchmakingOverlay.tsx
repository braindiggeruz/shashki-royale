import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, X } from "lucide-react";

interface MatchmakingOverlayProps {
  stake: number | null;
  onCancel: () => void;
  cancelling: boolean;
}

/**
 * Full-screen overlay shown to the white player while the matchmaker is
 * waiting for an opponent to join the stake game.
 *
 * The board is hidden behind a translucent backdrop so the user gets a clear
 * "we're looking for an opponent" affordance instead of an empty board with
 * a tiny header label.
 *
 * Lifecycle:
 *   - parent (OnlineGame) mounts this when game.status === 'waiting' and the
 *     viewer is the game creator (white).
 *   - parent unmounts as soon as the opponent's profile id appears on the
 *     game row (handled via realtime UPDATE → applyGameRow flips
 *     opponentConnected to true).
 *   - parent passes `cancelling=true` while the cancel RPC is in flight.
 *
 * `onCancel` is required: it calls cancel_stake_game RPC (which refunds the
 * white player's locked stake) and navigates back home.
 */
export default function MatchmakingOverlay({
  stake,
  onCancel,
  cancelling,
}: MatchmakingOverlayProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  // After 30s, gently hint that the user can cancel and try a different stake.
  const showLongWaitHint = elapsedSec >= 30;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center px-6"
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(26,8,0,0.92) 0%, rgba(10,5,3,0.97) 70%, rgba(0,0,0,0.98) 100%)",
        backdropFilter: "blur(6px)",
      }}
      data-testid="matchmaking-overlay"
    >
      <div className="w-full max-w-sm text-center">
        {/* Animated coin */}
        <motion.div
          animate={{ rotateY: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="mx-auto mb-6"
          style={{
            width: 96,
            height: 96,
            filter: "drop-shadow(0 0 24px rgba(255,215,0,0.5))",
          }}
        >
          <svg viewBox="0 0 100 100" width="96" height="96">
            <defs>
              <radialGradient id="mm-coin-grad" cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#FFE566" />
                <stop offset="50%" stopColor="#FFD700" />
                <stop offset="100%" stopColor="#B8860B" />
              </radialGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="url(#mm-coin-grad)"
              stroke="#D4AF37"
              strokeWidth="2"
            />
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />
            <text
              x="50"
              y="68"
              textAnchor="middle"
              fontSize="44"
              fontWeight="900"
              fill="#7a5200"
              fontFamily="serif"
            >
              ₡
            </text>
          </svg>
        </motion.div>

        <h2
          className="text-2xl font-black tracking-widest uppercase mb-2"
          style={{
            fontFamily: "Cinzel, serif",
            background:
              "linear-gradient(180deg, #FFD700 0%, #B8860B 60%, #FFD700 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 2px 6px rgba(180,130,0,0.5))",
          }}
        >
          Ищем соперника
        </h2>

        <div className="flex items-center justify-center gap-1.5 mb-4">
          <Loader2
            className="w-4 h-4 animate-spin"
            style={{ color: "#D4AF37" }}
          />
          <span
            className="text-sm tracking-wider"
            style={{ color: "rgba(212,175,55,0.75)", fontFamily: "Cinzel, serif" }}
          >
            {mm}:{ss}
          </span>
        </div>

        {stake != null && (
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl mb-6"
            style={{
              background:
                "linear-gradient(135deg, rgba(184,134,11,0.18) 0%, rgba(255,215,0,0.08) 100%)",
              border: "1px solid rgba(255,215,0,0.35)",
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <defs>
                <radialGradient id="mm-stake-coin" cx="40%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#FFE566" />
                  <stop offset="50%" stopColor="#FFD700" />
                  <stop offset="100%" stopColor="#B8860B" />
                </radialGradient>
              </defs>
              <circle
                cx="12"
                cy="12"
                r="11"
                fill="url(#mm-stake-coin)"
                stroke="#D4AF37"
                strokeWidth="0.8"
              />
              <text
                x="12"
                y="16.5"
                textAnchor="middle"
                fontSize="9"
                fontWeight="bold"
                fill="#7a5200"
                fontFamily="serif"
              >
                ₡
              </text>
            </svg>
            <span
              className="text-sm font-bold"
              style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
            >
              Ставка: {stake} Coin
            </span>
          </div>
        )}

        <p
          className="text-xs mb-6 leading-snug"
          style={{ color: "rgba(212,175,55,0.55)" }}
        >
          {showLongWaitHint
            ? "Пока не нашли соперника на эту ставку. Можно подождать или отменить и выбрать другую."
            : "Как только найдётся игрок с такой же ставкой — игра начнётся автоматически."}
        </p>

        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          data-testid="matchmaking-cancel-btn"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold uppercase tracking-widest cursor-pointer transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background:
              "linear-gradient(135deg, rgba(180,30,0,0.25) 0%, rgba(120,20,0,0.18) 100%)",
            border: "1px solid rgba(220,50,30,0.45)",
            color: "#FF8A80",
            fontFamily: "Cinzel, serif",
            minWidth: 180,
          }}
        >
          {cancelling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
          {cancelling ? "Отмена…" : "Отменить поиск"}
        </button>

        <p
          className="text-[10px] mt-4"
          style={{ color: "rgba(212,175,55,0.4)" }}
        >
          Ставка вернётся на ваш баланс
        </p>
      </div>
    </motion.div>
  );
}
