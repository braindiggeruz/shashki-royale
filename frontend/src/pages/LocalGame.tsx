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
      className="h-full flex flex-col overflow-hidden"
      style={{ background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)" }}
    >
      {/* Header — compact */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(212,175,55,0.15)" }}
      >
        <button
          onClick={() => navigate("/")}
          data-testid="back-button"
          className="p-2 cursor-pointer rounded-xl"
          style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.12)" }}
          aria-label="Назад"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: "#D4AF37" }} />
        </button>
        <p
          className="text-[11px] uppercase tracking-widest"
          style={{ color: "rgba(212,175,55,0.65)", fontFamily: "Cinzel, serif" }}
        >
          Локальная игра
        </p>
        <button
          onClick={() => setShowResignConfirm(true)}
          data-testid="resign-button"
          className="p-2 cursor-pointer rounded-xl"
          style={{ background: "rgba(180,30,0,0.2)", border: "1px solid rgba(200,50,30,0.2)" }}
          aria-label="Сдаться"
        >
          <Flag className="w-5 h-5 text-red-400" />
        </button>
      </div>

      {/* Compact turn banner with inline mandatory warning */}
      <div className="px-3 pt-2 flex-shrink-0">
        <motion.div
          key={`${gameState.currentTurn}-${hasMandatory}`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg"
          style={{
            background: hasMandatory
              ? "rgba(220, 50, 0, 0.18)"
              : "rgba(212,175,55,0.10)",
            border: `1px solid ${
              hasMandatory ? "rgba(220,80,0,0.35)" : "rgba(212,175,55,0.30)"
            }`,
          }}
          data-testid="turn-indicator"
        >
          {hasMandatory ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          ) : (
            <motion.div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              style={{ background: "#D4AF37" }}
            />
          )}
          <span
            className="font-semibold text-xs tracking-wide"
            style={{
              color: hasMandatory ? "#ff8a7a" : "#FFD700",
              fontFamily: "Cinzel, serif",
            }}
          >
            {hasMandatory
              ? "Взятие обязательно!"
              : isWhiteTurn
              ? "Ход белых"
              : "Ход чёрных"}
          </span>
        </motion.div>
      </div>

      {/* Top player chip (black) */}
      <div className="px-3 pt-2 flex-shrink-0">
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
          style={{
            background: !isWhiteTurn ? "rgba(212,175,55,0.10)" : "rgba(255,255,255,0.025)",
            border: `1px solid ${!isWhiteTurn ? "rgba(212,175,55,0.45)" : "rgba(212,175,55,0.12)"}`,
            opacity: !isWhiteTurn ? 1 : 0.7,
            transition: "all 0.25s",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full border-2 flex-shrink-0"
              style={{
                background: "radial-gradient(circle at 35% 35%, #555 0%, #000 100%)",
                borderColor: "#D4AF37",
              }}
            />
            <span
              className="text-sm font-semibold"
              style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
            >
              Чёрные
            </span>
          </div>
          <div
            className="flex flex-col items-center px-2 py-0.5 rounded-md"
            style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.18)", minWidth: 44 }}
          >
            <span className="text-[9px] uppercase tracking-wider leading-none" style={{ color: "rgba(212,175,55,0.55)", fontFamily: "Cinzel, serif" }}>
              Срубл.
            </span>
            <span className="text-base font-bold leading-tight" style={{ color: "#FFD700" }}>
              {12 - gameState.board.flat().filter((c) => c?.color === "black").length}
            </span>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 flex items-center justify-center px-1 py-1 min-h-0">
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

      {/* Bottom player chip (white) */}
      <div className="px-3 pb-3 pt-1 flex-shrink-0">
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
          style={{
            background: isWhiteTurn ? "rgba(212,175,55,0.10)" : "rgba(255,255,255,0.025)",
            border: `1px solid ${isWhiteTurn ? "rgba(212,175,55,0.45)" : "rgba(212,175,55,0.12)"}`,
            opacity: isWhiteTurn ? 1 : 0.7,
            transition: "all 0.25s",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full border-2 flex-shrink-0"
              style={{
                background: "radial-gradient(circle at 35% 35%, #FFFFFF 0%, #D4B896 100%)",
                borderColor: "#D4AF37",
              }}
            />
            <span
              className="text-sm font-semibold"
              style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
            >
              Белые
            </span>
          </div>
          <div
            className="flex flex-col items-center px-2 py-0.5 rounded-md"
            style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.18)", minWidth: 44 }}
          >
            <span className="text-[9px] uppercase tracking-wider leading-none" style={{ color: "rgba(212,175,55,0.55)", fontFamily: "Cinzel, serif" }}>
              Срубл.
            </span>
            <span className="text-base font-bold leading-tight" style={{ color: "#FFD700" }}>
              {12 - gameState.board.flat().filter((c) => c?.color === "white").length}
            </span>
          </div>
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
