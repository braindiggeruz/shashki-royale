import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Flag, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import BoardView from "../components/Board.tsx";
import GameOverModal from "../components/GameOverModal.tsx";
import { createInitialGameState, selectPiece, applyMoveToState } from "../game/gameLogic.ts";
import { generateLegalMoves } from "../game/rules.ts";
import { useAudio } from "../hooks/use-audio.ts";
import type { GameState, Move, PlayerColor } from "../game/types.ts";

export default function LocalGame() {
  const navigate = useNavigate();
  const { play } = useAudio();
  const [gameState, setGameState] = useState<GameState>(createInitialGameState);
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (gameState.gameOver) return;
      const { board, currentTurn, selectedPiece, legalMoves } = gameState;

      if (selectedPiece) {
        const matchingMove = legalMoves.find(
          (m) => m.finalRow === row && m.finalCol === col,
        );
        if (matchingMove) {
          if (matchingMove.isCapture) play("capture");
          else play("move");
          if (matchingMove.promoted) setTimeout(() => play("promote"), 150);
          setGameState((prev) => applyMoveToState(prev, matchingMove));
          return;
        }
      }

      const piece = board[row][col];
      if (piece && piece.color === currentTurn) {
        setGameState((prev) => selectPiece(prev, row, col));
        return;
      }

      setGameState((prev) => ({
        ...prev,
        selectedPiece: null,
        legalMoves: generateLegalMoves(prev.board, prev.currentTurn),
      }));
    },
    [gameState],
  );

  const handleResign = (color: PlayerColor) => {
    const winner: PlayerColor = color === "white" ? "black" : "white";
    setGameState((prev) => ({
      ...prev,
      gameOver: true,
      winner,
      winReason: `${color === "white" ? "Белые" : "Чёрные"} сдались`,
    }));
    setShowResignConfirm(false);
  };

  const handleRematch = () => {
    setGameState(createInitialGameState());
    setShowResignConfirm(false);
  };

  const hasMandatory =
    !gameState.gameOver &&
    gameState.legalMoves.some((m) => m.isCapture) &&
    gameState.legalMoves.length > 0;

  const isWhiteTurn = gameState.currentTurn === "white";

  return (
    <div
      data-testid="local-game"
      className="h-[100dvh] flex flex-col overflow-hidden"
      style={{ background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(212,175,55,0.15)" }}
      >
        <button
          onClick={() => navigate("/")}
          className="p-2 cursor-pointer rounded-xl"
          style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.12)" }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: "#D4AF37" }} />
        </button>
        <div className="text-center">
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "rgba(212,175,55,0.6)", fontFamily: "Cinzel, serif" }}
          >
            Локальная игра
          </p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(212,175,55,0.4)" }}>
            Ход {gameState.moveNumber}
          </p>
        </div>
        <button
          onClick={() => setShowResignConfirm(true)}
          className="p-2 cursor-pointer rounded-xl"
          style={{ background: "rgba(180,30,0,0.2)", border: "1px solid rgba(200,50,30,0.2)" }}
        >
          <Flag className="w-5 h-5 text-red-400" />
        </button>
      </div>

      {/* Player labels */}
      <div className="px-4 pt-2 pb-0 flex-shrink-0 flex justify-between items-center">
        {/* Black (top) */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all"
          style={{
            border: !isWhiteTurn ? "1px solid rgba(212,175,55,0.5)" : "1px solid transparent",
            background: !isWhiteTurn ? "rgba(212,175,55,0.08)" : "transparent",
            opacity: isWhiteTurn ? 0.4 : 1,
          }}
        >
          <div
            className="w-4 h-4 rounded-full border flex-shrink-0"
            style={{
              background: "radial-gradient(circle at 35% 35%, #555 0%, #000 100%)",
              borderColor: "#D4AF37",
            }}
          />
          <span
            className="text-xs font-semibold"
            style={{ color: !isWhiteTurn ? "#FFD700" : "rgba(200,150,50,0.5)", fontFamily: "Cinzel, serif" }}
          >
            Чёрные{!isWhiteTurn && " ◀"}
          </span>
        </div>

        {/* White (bottom) */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all"
          style={{
            border: isWhiteTurn ? "1px solid rgba(212,175,55,0.5)" : "1px solid transparent",
            background: isWhiteTurn ? "rgba(212,175,55,0.08)" : "transparent",
            opacity: !isWhiteTurn ? 0.4 : 1,
          }}
        >
          <span
            className="text-xs font-semibold"
            style={{ color: isWhiteTurn ? "#FFD700" : "rgba(200,150,50,0.5)", fontFamily: "Cinzel, serif" }}
          >
            {isWhiteTurn && "▶ "}Белые
          </span>
          <div
            className="w-4 h-4 rounded-full border flex-shrink-0"
            style={{
              background: "radial-gradient(circle at 35% 35%, #FFFFFF 0%, #D4B896 100%)",
              borderColor: "#D4AF37",
            }}
          />
        </div>
      </div>

      {/* Turn banner */}
      <div className="px-4 pt-2 pb-1 flex-shrink-0">
        <motion.div
          key={gameState.currentTurn}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl"
          style={{
            background: isWhiteTurn ? "rgba(212,175,55,0.1)" : "rgba(80,60,20,0.12)",
            border: `1px solid ${isWhiteTurn ? "rgba(212,175,55,0.35)" : "rgba(212,175,55,0.15)"}`,
          }}
        >
          {/* Pulsing dot */}
          <motion.div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            style={{ background: "#D4AF37" }}
          />
          <span
            className="font-bold text-sm tracking-wide"
            style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
          >
            {isWhiteTurn ? "ВАШ ХОД — БЕЛЫЕ" : "ВАШ ХОД — ЧЁРНЫЕ"}
          </span>
        </motion.div>

        <AnimatePresence>
          {hasMandatory && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 flex items-center gap-2 py-1.5 px-3 rounded-lg"
              style={{ background: "rgba(220, 50, 0, 0.15)", border: "1px solid rgba(220,80,0,0.3)" }}
            >
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-300">Взятие обязательно!</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Board */}
      <div className="flex-1 flex items-center justify-center px-2 py-2 min-h-0">
        <BoardView
          board={gameState.board}
          currentTurn={gameState.currentTurn}
          myColor={null}
          selectedPiece={gameState.selectedPiece}
          legalMoves={gameState.legalMoves}
          onCellClick={handleCellClick}
          lastMove={gameState.lastMove}
        />
      </div>

      {/* Captured piece counts — compact pill (no overlap) */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="flex justify-center gap-2">
          {(["white", "black"] as PlayerColor[]).map((color) => {
            const remaining = gameState.board.flat().filter((c) => c?.color === color).length;
            const captured = 12 - remaining;
            return (
              <div
                key={color}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(212,175,55,0.12)",
                }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full border"
                  style={{
                    background: color === "white"
                      ? "radial-gradient(circle at 35% 35%, #FFFFFF 0%, #D4B896 100%)"
                      : "radial-gradient(circle at 35% 35%, #555 0%, #000 100%)",
                    borderColor: "#D4AF37",
                  }}
                />
                <span className="text-[11px] font-bold" style={{ color: captured > 0 ? "#FFD700" : "rgba(212,175,55,0.35)", fontFamily: "Cinzel, serif" }}>
                  {captured}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resign confirm */}
      <AnimatePresence>
        {showResignConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          >
            <div
              className="mx-6 p-6 rounded-2xl"
              style={{
                background: "#1a0800",
                border: "1px solid rgba(212,175,55,0.25)",
                maxWidth: 300,
                width: "100%",
              }}
            >
              <h3 className="text-lg font-bold text-center mb-2" style={{ fontFamily: "Cinzel, serif", color: "#FFD700" }}>
                Сдаться?
              </h3>
              <p className="text-sm text-center mb-4" style={{ color: "rgba(200,160,80,0.7)" }}>
                Чьи шашки сдаются?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleResign("white")}
                  className="py-2.5 cursor-pointer"
                  style={{ borderRadius: "12px", background: "rgba(200,160,50,0.15)", border: "1px solid rgba(212,175,55,0.3)", color: "#FFD700", fontFamily: "Cinzel, serif" }}
                >
                  Белые сдаются
                </button>
                <button
                  onClick={() => handleResign("black")}
                  className="py-2.5 cursor-pointer"
                  style={{ borderRadius: "12px", background: "rgba(180,30,0,0.15)", border: "1px solid rgba(200,50,30,0.3)", color: "#ff6b6b", fontFamily: "Cinzel, serif" }}
                >
                  Чёрные сдаются
                </button>
                <button
                  onClick={() => setShowResignConfirm(false)}
                  className="py-2.5 cursor-pointer"
                  style={{ color: "rgba(212,175,55,0.5)" }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {gameState.gameOver && (
        <GameOverModal
          winner={gameState.winner}
          reason={gameState.winReason}
          myColor={null}
          onHome={() => navigate("/")}
          onRematch={handleRematch}
          moveCount={gameState.moveNumber}
        />
      )}
    </div>
  );
}
