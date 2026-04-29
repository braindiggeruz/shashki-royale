import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import type { PlayerColor } from "../game/types.ts";

type GameOverModalProps = {
  winner: PlayerColor | "draw" | null;
  reason: string | null;
  myColor: PlayerColor | null;
  onHome: () => void;
  onRematch?: () => void;
  moveCount?: number;
};

// Simple confetti particle
type Particle = { id: number; x: number; color: string; delay: number; duration: number };

function generateParticles(count: number): Particle[] {
  const colors = ["#FFD700", "#D4AF37", "#FFF8DC", "#FF6B6B", "#4ECDC4", "#FFE66D"];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 0.8,
    duration: 1.2 + Math.random() * 0.8,
  }));
}

export default function GameOverModal({
  winner,
  reason,
  myColor,
  onHome,
  onRematch,
  moveCount,
}: GameOverModalProps) {
  const [particles] = useState(() => generateParticles(20));
  const [showConfetti, setShowConfetti] = useState(false);

  const isMyWin = myColor !== null && winner === myColor;
  const isDraw = winner === "draw";
  // For local game (myColor=null), show winner info
  const isWinnerWhite = myColor === null && winner === "white";
  const isWinnerBlack = myColor === null && winner === "black";
  const isVictory = isMyWin || isWinnerWhite || isWinnerBlack;

  useEffect(() => {
    if (isVictory && !isDraw) {
      const t = setTimeout(() => setShowConfetti(true), 100);
      return () => clearTimeout(t);
    }
  }, [isVictory, isDraw]);

  const titleText = isDraw
    ? "Ничья"
    : myColor !== null
    ? isMyWin
      ? "ПОБЕДА!"
      : "Поражение"
    : winner === "white"
    ? "Белые победили"
    : "Чёрные победили";

  const titleColor = isDraw
    ? "#D4AF37"
    : isVictory
    ? "#FFD700"
    : "#ff6b6b";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm overflow-hidden">
      {/* Confetti */}
      <AnimatePresence>
        {showConfetti &&
          particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute top-0 w-2 h-2 rounded-sm pointer-events-none"
              style={{ left: `${p.x}%`, background: p.color }}
              initial={{ y: -20, opacity: 1, rotate: 0, scale: 1 }}
              animate={{ y: "110vh", opacity: 0, rotate: 720, scale: 0.5 }}
              transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
            />
          ))}
      </AnimatePresence>

      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="mx-4 p-7 rounded-3xl text-center relative"
        style={{
          background: "linear-gradient(160deg, #1a0800 0%, #2d0f00 100%)",
          border: `1px solid ${isVictory ? "rgba(212,175,55,0.5)" : "rgba(200,50,30,0.3)"}`,
          boxShadow: isVictory
            ? "0 0 60px rgba(212,175,55,0.2), 0 20px 60px rgba(0,0,0,0.5)"
            : "0 20px 60px rgba(0,0,0,0.5)",
          maxWidth: 340,
          width: "100%",
        }}
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 280, damping: 18 }}
          className="text-6xl mb-4 leading-none"
        >
          {isDraw ? "⚖️" : isVictory ? (
            <svg viewBox="0 0 80 52" width="72" height="46" style={{ margin: "0 auto", filter: "drop-shadow(0 0 16px rgba(212,175,55,0.8))" }}>
              <defs>
                <linearGradient id="winCrownGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#FFD700" />
                  <stop offset="100%" stopColor="#B8860B" />
                </linearGradient>
              </defs>
              <path d="M8 44 L14 16 L26 32 L40 4 L54 32 L66 16 L72 44 Z" fill="url(#winCrownGrad)" stroke="#FFE066" strokeWidth="1" />
              <rect x="8" y="40" width="64" height="10" rx="3" fill="url(#winCrownGrad)" stroke="#FFE066" strokeWidth="0.8" />
              <circle cx="40" cy="6" r="4" fill="#DC143C" stroke="#FFD700" strokeWidth="0.8" />
              <circle cx="14" cy="17" r="3" fill="#DC143C" stroke="#FFD700" strokeWidth="0.8" />
              <circle cx="66" cy="17" r="3" fill="#DC143C" stroke="#FFD700" strokeWidth="0.8" />
              <circle cx="40" cy="45" r="2.5" fill="#DC143C" />
            </svg>
          ) : "💀"}
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-3xl font-black mb-1 tracking-wider"
          style={{ fontFamily: "Cinzel, serif", color: titleColor }}
        >
          {titleText}
        </motion.h2>

        {reason && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-sm mb-1"
            style={{ color: "rgba(200,160,80,0.65)" }}
          >
            {reason}
          </motion.p>
        )}

        {moveCount !== undefined && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xs mb-5"
            style={{ color: "rgba(200,150,50,0.4)" }}
          >
            Сыграно ходов: {moveCount}
          </motion.p>
        )}

        {!reason && !moveCount && <div className="mb-5" />}

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="flex flex-col gap-3"
        >
          {onRematch && (
            <button
              onClick={onRematch}
              className="w-full py-3.5 font-bold text-sm cursor-pointer transition-all active:scale-95"
              style={{
                borderRadius: "12px",
                background: "linear-gradient(135deg, #b8860b, #ffd700)",
                color: "#1a0800",
                fontFamily: "Cinzel, serif",
                border: "1px solid #D4AF37",
              }}
            >
              Сыграть снова
            </button>
          )}
          <button
            onClick={onHome}
            className="w-full py-3.5 font-semibold text-sm cursor-pointer transition-all active:scale-95"
            style={{
              borderRadius: "12px",
              background: "rgba(212,175,55,0.08)",
              border: "1px solid rgba(212,175,55,0.3)",
              color: "#FFD700",
              fontFamily: "Cinzel, serif",
            }}
          >
            На главный экран
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
