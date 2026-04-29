import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import type { CellState } from "../game/types.ts";

type PieceProps = {
  piece: CellState;
  isSelected: boolean;
  isLastMoveTo?: boolean;
  isLastMoveFrom?: boolean;
  onClick?: () => void;
};

export default function Piece({
  piece,
  isSelected,
  isLastMoveTo = false,
  isLastMoveFrom = false,
  onClick,
}: PieceProps) {
  const [showPromoteFlash, setShowPromoteFlash] = useState(false);
  const [wasKing, setWasKing] = useState(piece?.type === "king");

  useEffect(() => {
    if (!piece) return;
    if (piece.type === "king" && !wasKing) {
      setShowPromoteFlash(true);
      const t = setTimeout(() => setShowPromoteFlash(false), 1200);
      return () => clearTimeout(t);
    }
    setWasKing(piece.type === "king");
  }, [piece, wasKing]);

  if (!piece) return null;

  const isWhite = piece.color === "white";
  const isKing = piece.type === "king";

  // BLACK & WHITE pieces with gold rims
  const baseGradient = isWhite
    ? "radial-gradient(circle at 35% 35%, #FFFFFF 0%, #F5E6C8 40%, #D4B896 100%)"
    : "radial-gradient(circle at 35% 35%, #555555 0%, #1A1A1A 40%, #000000 100%)";

  const shadowBase = isWhite
    ? "2px 4px 10px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.8)"
    : "2px 4px 10px rgba(0,0,0,0.7), inset 0 2px 4px rgba(255,255,255,0.15)";

  const selectedShadow = "0 0 18px 6px rgba(76,175,80,0.7), 0 4px 12px rgba(0,0,0,0.7)";

  const innerHighlight = isWhite
    ? "radial-gradient(ellipse at 30% 25%, rgba(255,255,255,0.9) 0%, transparent 50%)"
    : "radial-gradient(ellipse at 30% 25%, rgba(255,255,255,0.12) 0%, transparent 50%)";

  return (
    <div className="relative w-full h-full">
      {/* Last-move "from" dim ghost glow */}
      {isLastMoveFrom && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.8 }}
          style={{ background: "radial-gradient(circle, rgba(212,175,55,0.7) 0%, transparent 70%)" }}
        />
      )}

      {/* Last-move "to" arrival pulse */}
      {isLastMoveTo && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          initial={{ scale: 1.6, opacity: 1 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 0.7 }}
          style={{ background: "radial-gradient(circle, rgba(212,175,55,0.9) 0%, transparent 70%)" }}
        />
      )}

      {/* Promotion flash */}
      <AnimatePresence>
        {showPromoteFlash && (
          <motion.div
            className="absolute -inset-4 rounded-full pointer-events-none z-30"
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 2.8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            style={{
              background: "radial-gradient(circle, rgba(212,175,55,0.95) 0%, rgba(255,140,0,0.5) 40%, transparent 70%)",
              boxShadow: "0 0 40px 12px rgba(212,175,55,0.6)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Main piece body */}
      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.92 }}
        animate={
          isSelected
            ? { scale: 1.12, y: -4 }
            : { scale: 1, y: 0 }
        }
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
        className="w-full h-full rounded-full relative overflow-hidden cursor-pointer"
        style={{
          background: baseGradient,
          border: "2px solid #D4AF37",
          boxShadow: isSelected ? selectedShadow : shadowBase,
          outline: "none",
        }}
      >
        {/* Inner shine highlight */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: innerHighlight }}
        />

        {/* Bottom rim depth */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/3 rounded-b-full pointer-events-none"
          style={{
            background: isWhite
              ? "linear-gradient(to bottom, transparent, rgba(150,100,50,0.2))"
              : "linear-gradient(to bottom, transparent, rgba(0,0,0,0.5))",
          }}
        />

        {/* King crown */}
        {isKing && (
          <motion.div
            initial={wasKing ? false : { scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            {/* Crown glow */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle at 50% 50%, rgba(212,175,55,0.4) 0%, transparent 65%)",
              }}
            />
            {/* Crown SVG */}
            <svg
              viewBox="0 0 24 16"
              className="relative z-10"
              style={{
                width: "55%",
                height: "55%",
                filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9)) drop-shadow(0 0 6px rgba(212,175,55,1))",
              }}
            >
              <path
                d="M2 14 L4 5 L8 10 L12 2 L16 10 L20 5 L22 14 Z"
                fill="#D4AF37"
                stroke="#FFD700"
                strokeWidth="0.5"
              />
              <circle cx="2" cy="14" r="1.5" fill="#D4AF37" />
              <circle cx="22" cy="14" r="1.5" fill="#D4AF37" />
              <circle cx="12" cy="2" r="1.5" fill="#FFD700" />
              <circle cx="4" cy="5" r="1.2" fill="#D4AF37" />
              <circle cx="20" cy="5" r="1.2" fill="#D4AF37" />
            </svg>
          </motion.div>
        )}

        {/* Selected pulsing ring — GREEN (matching video) */}
        {isSelected && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: 1 }}
            style={{
              border: "2.5px solid rgba(76,175,80,0.9)",
              boxShadow: "inset 0 0 10px rgba(76,175,80,0.5), 0 0 12px rgba(76,175,80,0.4)",
            }}
          />
        )}
      </motion.button>
    </div>
  );
}
