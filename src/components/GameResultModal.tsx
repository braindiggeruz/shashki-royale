import { motion, AnimatePresence } from "motion/react";
import { Trophy, Gift, Zap, Home } from "lucide-react";

export type GameResult = {
  winner: "white" | "black" | "draw";
  whitePlayer: string;
  blackPlayer: string;
  entryFee: number;
  pot: number;
  payout?: number;
  commission?: number;
};

interface GameResultModalProps {
  result: GameResult | null;
  onClose: () => void;
  isLoading?: boolean;
}

/**
 * Modal shown when a Coin-stake online match ends.
 *
 * Mobile-safe layout: the overlay does NOT prevent the inner panel from
 * scrolling. The inner panel is capped at `100dvh - safe-area` and contains
 * its own scroll, with a sticky CTA so the "На главный экран" button is
 * always reachable, even on a 360x640 device with a tall Android navigation
 * bar.
 *
 * Settlement (Coin payout) is performed exactly once by the parent component
 * BEFORE this modal mounts (via processGameResult RPC, which is idempotent
 * on the server). Re-rendering / closing / reopening this modal will NOT
 * trigger a second payout — the `result` prop is already-settled data read
 * from the parent state.
 */
export function GameResultModal({ result, onClose, isLoading = false }: GameResultModalProps) {
  if (!result) return null;

  const isWinner = result.winner !== "draw";
  const isDraw = result.winner === "draw";
  const payout = result.payout ?? 0;
  const commission = result.commission ?? 0;

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center"
          style={{
            paddingTop: "max(env(safe-area-inset-top, 0px), 16px)",
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
            paddingLeft: "max(env(safe-area-inset-left, 0px), 12px)",
            paddingRight: "max(env(safe-area-inset-right, 0px), 12px)",
            overscrollBehavior: "contain",
          }}
          onClick={onClose}
          data-testid="game-result-overlay"
        >
          <motion.div
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 12 }}
            transition={{ type: "spring", damping: 22 }}
            className="rounded-3xl w-full shadow-2xl flex flex-col relative"
            style={{
              background: "linear-gradient(180deg, rgba(26,8,0,0.97) 0%, rgba(13,4,0,0.97) 100%)",
              border: "2px solid rgba(212,175,55,0.4)",
              maxWidth: "28rem",
              maxHeight:
                "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px)",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
            data-testid="game-result-modal"
          >
            {/* Scrollable content area */}
            <div
              className="px-6 pt-8 pb-4 flex-1 min-h-0 overflow-y-auto"
              style={{
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
              }}
              data-testid="game-result-scroll"
            >
              {/* Header */}
              <div className="text-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.15, type: "spring" }}
                  className="flex justify-center mb-3"
                >
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(212,175,55,0.2)" }}
                  >
                    {isDraw ? (
                      <Zap className="w-8 h-8" style={{ color: "#FFD700" }} />
                    ) : (
                      <Trophy className="w-8 h-8" style={{ color: "#FFD700" }} />
                    )}
                  </div>
                </motion.div>

                <h2
                  className="text-2xl font-bold mb-1"
                  style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
                  data-testid="game-result-title"
                >
                  {isDraw ? "Ничья!" : "Игра завершена!"}
                </h2>
                <p style={{ color: "rgba(212,175,55,0.6)", fontSize: "0.875rem" }}>
                  {isDraw
                    ? "Обе стороны сыграли вничью"
                    : result.winner === "white"
                      ? "Белые победили!"
                      : "Чёрные победили!"}
                </p>
              </div>

              {/* Players */}
              <div className="space-y-2 mb-5">
                <div
                  className="flex justify-between items-center p-2.5 rounded-lg"
                  style={{ background: "rgba(212,175,55,0.08)" }}
                >
                  <span className="text-sm" style={{ color: "#D4AF37" }}>
                    {result.whitePlayer}
                  </span>
                  <span
                    className="font-bold text-sm"
                    style={{
                      color: result.winner === "white" ? "#FFD700" : "rgba(212,175,55,0.5)",
                    }}
                  >
                    ♟ Белые
                  </span>
                </div>
                <div
                  className="flex justify-between items-center p-2.5 rounded-lg"
                  style={{ background: "rgba(212,175,55,0.08)" }}
                >
                  <span className="text-sm" style={{ color: "#D4AF37" }}>
                    {result.blackPlayer}
                  </span>
                  <span
                    className="font-bold text-sm"
                    style={{
                      color: result.winner === "black" ? "#FFD700" : "rgba(212,175,55,0.5)",
                    }}
                  >
                    ♟ Чёрные
                  </span>
                </div>
              </div>

              {/* Stakes Info */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-xl p-3 mb-5"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(255,215,0,0.1) 100%)",
                  border: "1px solid rgba(212,175,55,0.2)",
                }}
              >
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color: "rgba(212,175,55,0.6)" }}>Ставка за игрока:</span>
                    <span style={{ color: "#D4AF37" }}>
                      {result.entryFee.toFixed(2)} 💎
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "rgba(212,175,55,0.6)" }}>Общий пул:</span>
                    <span style={{ color: "#FFD700" }}>{result.pot.toFixed(2)} 💎</span>
                  </div>
                  {commission > 0 && (
                    <div
                      className="flex justify-between pt-1.5 border-t"
                      style={{ borderColor: "rgba(212,175,55,0.2)" }}
                    >
                      <span style={{ color: "rgba(212,175,55,0.6)" }}>Комиссия (5%):</span>
                      <span style={{ color: "#ef4444" }}>-{commission.toFixed(2)} 💎</span>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Payout */}
              {isWinner && payout > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-xl p-3 mb-4 text-center"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(74,222,128,0.18) 0%, rgba(34,197,94,0.08) 100%)",
                    border: "2px solid rgba(74,222,128,0.3)",
                  }}
                  data-testid="payout-block"
                >
                  <p style={{ color: "rgba(74,222,128,0.7)", fontSize: "0.8rem" }}>Ваш выигрыш</p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <Gift className="w-5 h-5" style={{ color: "#4ade80" }} />
                    <p
                      className="text-2xl font-bold"
                      style={{ color: "#4ade80", fontFamily: "Cinzel, serif" }}
                    >
                      +{payout.toFixed(2)}
                    </p>
                  </div>
                </motion.div>
              )}

              {isDraw && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-xl p-3 mb-4 text-center"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(37,99,235,0.08) 100%)",
                    border: "2px solid rgba(59,130,246,0.3)",
                  }}
                  data-testid="refund-block"
                >
                  <p style={{ color: "rgba(59,130,246,0.7)", fontSize: "0.8rem" }}>
                    Ставка возвращена
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <Gift className="w-5 h-5" style={{ color: "#3b82f6" }} />
                    <p
                      className="text-2xl font-bold"
                      style={{ color: "#3b82f6", fontFamily: "Cinzel, serif" }}
                    >
                      +{result.entryFee.toFixed(2)}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Sticky action area — always visible above Android nav bar */}
            <div
              className="px-6 pt-3 rounded-b-3xl"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
                background:
                  "linear-gradient(0deg, rgba(13,4,0,0.97) 0%, rgba(13,4,0,0.85) 80%, rgba(13,4,0,0) 100%)",
                borderTop: "1px solid rgba(212,175,55,0.15)",
                flexShrink: 0,
              }}
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                disabled={isLoading}
                className="w-full py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #D4AF37 0%, #FFD700 100%)",
                  color: "#0d0400",
                  fontFamily: "Cinzel, serif",
                }}
                data-testid="game-result-home-btn"
              >
                <Home className="w-4 h-4" />
                {isLoading ? "Обработка..." : "На главный экран"}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
