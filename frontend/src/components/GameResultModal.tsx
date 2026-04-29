import { motion, AnimatePresence } from "motion/react";
import { Trophy, Gift, Zap } from "lucide-react";

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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 20 }}
            transition={{ type: "spring", damping: 20 }}
            className="bg-gradient-to-b rounded-3xl p-8 max-w-md w-full shadow-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(26,8,0,0.95) 0%, rgba(13,4,0,0.95) 100%)",
              border: "2px solid rgba(212,175,55,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="flex justify-center mb-4"
              >
                {isDraw ? (
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(212,175,55,0.2)" }}
                  >
                    <Zap className="w-10 h-10" style={{ color: "#FFD700" }} />
                  </div>
                ) : (
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(212,175,55,0.2)" }}
                  >
                    <Trophy className="w-10 h-10" style={{ color: "#FFD700" }} />
                  </div>
                )}
              </motion.div>

              <h2
                className="text-3xl font-bold mb-2"
                style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
              >
                {isDraw ? "Ничья!" : "Игра завершена!"}
              </h2>
              <p style={{ color: "rgba(212,175,55,0.6)" }}>
                {isDraw ? "Обе стороны сыграли вничью" : result.winner === "white" ? "Белые победили!" : "Чёрные победили!"}
              </p>
            </div>

            {/* Players */}
            <div className="space-y-3 mb-8">
              <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: "rgba(212,175,55,0.08)" }}>
                <span style={{ color: "#D4AF37" }}>{result.whitePlayer}</span>
                <span
                  className="font-bold"
                  style={{
                    color: result.winner === "white" ? "#FFD700" : "rgba(212,175,55,0.5)",
                  }}
                >
                  ♟ Белые
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: "rgba(212,175,55,0.08)" }}>
                <span style={{ color: "#D4AF37" }}>{result.blackPlayer}</span>
                <span
                  className="font-bold"
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-r rounded-xl p-4 mb-8"
              style={{
                background: "linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(255,215,0,0.1) 100%)",
                border: "1px solid rgba(212,175,55,0.2)",
              }}
            >
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: "rgba(212,175,55,0.6)" }}>Ставка за игрока:</span>
                  <span style={{ color: "#D4AF37" }}>{result.entryFee.toFixed(2)} 💎</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "rgba(212,175,55,0.6)" }}>Общий пул:</span>
                  <span style={{ color: "#FFD700" }}>{result.pot.toFixed(2)} 💎</span>
                </div>
                {commission !== undefined && commission > 0 && (
                  <div className="flex justify-between pt-2 border-t border-opacity-20" style={{ borderColor: "rgba(212,175,55,0.3)" }}>
                    <span style={{ color: "rgba(212,175,55,0.6)" }}>Комиссия (5%):</span>
                    <span style={{ color: "#ef4444" }}>-{commission.toFixed(2)} 💎</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Payout */}
            {isWinner && payout > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="bg-gradient-to-r rounded-xl p-4 mb-8 text-center"
                style={{
                  background: "linear-gradient(135deg, rgba(74,222,128,0.2) 0%, rgba(34,197,94,0.1) 100%)",
                  border: "2px solid rgba(74,222,128,0.3)",
                }}
              >
                <p style={{ color: "rgba(74,222,128,0.7)", fontSize: "0.875rem" }}>Ваш выигрыш</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Gift className="w-5 h-5" style={{ color: "#4ade80" }} />
                  <p className="text-3xl font-bold" style={{ color: "#4ade80", fontFamily: "Cinzel, serif" }}>
                    +{payout.toFixed(2)}
                  </p>
                </div>
              </motion.div>
            )}

            {isDraw && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="bg-gradient-to-r rounded-xl p-4 mb-8 text-center"
                style={{
                  background: "linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(37,99,235,0.1) 100%)",
                  border: "2px solid rgba(59,130,246,0.3)",
                }}
              >
                <p style={{ color: "rgba(59,130,246,0.7)", fontSize: "0.875rem" }}>Ставка возвращена</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Gift className="w-5 h-5" style={{ color: "#3b82f6" }} />
                  <p className="text-3xl font-bold" style={{ color: "#3b82f6", fontFamily: "Cinzel, serif" }}>
                    +{result.entryFee.toFixed(2)}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Close Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              disabled={isLoading}
              className="w-full py-3 rounded-lg font-bold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #D4AF37 0%, #FFD700 100%)",
                color: "#0d0400",
              }}
            >
              {isLoading ? "Обработка..." : "Закрыть"}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
