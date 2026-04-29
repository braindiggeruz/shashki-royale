import { useEffect, useRef, useState, useCallback } from "react";
import type { Board, Move, PlayerColor, CellState } from "../game/types.ts";
import Piece from "./Piece.tsx";

type LastMove = {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
};

type AnimatingPiece = {
  id: string;
  piece: CellState;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  isCapture: boolean;
};

type CaptureParticle = {
  id: string;
  row: number;
  col: number;
};

type InvalidTap = {
  id: string;
  row: number;
  col: number;
};

type BoardProps = {
  board: Board;
  currentTurn: PlayerColor;
  myColor: PlayerColor | null;
  selectedPiece: { row: number; col: number } | null;
  legalMoves: Move[];
  onCellClick: (row: number, col: number) => void;
  flipped?: boolean;
  lastMove?: LastMove | null;
  onMoveAnimEnd?: (isCapture: boolean) => void;
};

const ANIM_DURATION_MS = 350;
// Board colors — wood-like (matching video reference)
const DARK_SQ = "#6D4C41";
const LIGHT_SQ = "#D7CCC8";

// Green highlight colors (from video reference)
const SELECTED_BG = "#2E7D32";
const SELECTED_GLOW = "rgba(76, 175, 80, 0.45)";
const MOVE_DOT_COLOR = "rgba(76, 175, 80, 0.85)";
const MOVE_DOT_BORDER = "rgba(56, 142, 60, 0.9)";

export default function BoardView({
  board,
  currentTurn,
  myColor,
  selectedPiece,
  legalMoves,
  onCellClick,
  flipped = false,
  lastMove,
  onMoveAnimEnd,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [animating, setAnimating] = useState<AnimatingPiece | null>(null);
  const prevBoardRef = useRef<Board>(board);
  const prevLastMoveRef = useRef<LastMove | null | undefined>(null);
  const [captureParticles, setCaptureParticles] = useState<CaptureParticle[]>([]);
  const [invalidTaps, setInvalidTaps] = useState<InvalidTap[]>([]);

  const [highlightLastMove, setHighlightLastMove] = useState(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect board change to trigger smooth animation
  useEffect(() => {
    if (
      lastMove &&
      lastMove !== prevLastMoveRef.current &&
      containerRef.current
    ) {
      const prev = prevBoardRef.current;
      const movingPiece = prev[lastMove.fromRow]?.[lastMove.fromCol];
      
      // Update refs immediately so next render has correct state
      prevLastMoveRef.current = lastMove;
      prevBoardRef.current = board;

      if (movingPiece) {
        const prevCount = prev.flat().filter(Boolean).length;
        const nextCount = board.flat().filter(Boolean).length;
        const wasCapture = nextCount < prevCount;

        const anim: AnimatingPiece = {
          id: `${lastMove.fromRow}-${lastMove.fromCol}-${Date.now()}`,
          piece: board[lastMove.toRow][lastMove.toCol] ?? movingPiece,
          fromRow: lastMove.fromRow,
          fromCol: lastMove.fromCol,
          toRow: lastMove.toRow,
          toCol: lastMove.toCol,
          isCapture: wasCapture,
        };
        setAnimating(anim);

        const timer = setTimeout(() => {
          setAnimating(null);
          onMoveAnimEnd?.(wasCapture);
          if (wasCapture) {
            const particleId = `p-${Date.now()}`;
            setCaptureParticles((prev2) => [...prev2, { id: particleId, row: lastMove.toRow, col: lastMove.toCol }]);
            setTimeout(() => {
              setCaptureParticles((prev2) => prev2.filter((p) => p.id !== particleId));
            }, 700);
          }
        }, ANIM_DURATION_MS + 30);
        return () => clearTimeout(timer);
      }

      setHighlightLastMove(true);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightLastMove(false), 3000);
    } else {
      prevBoardRef.current = board;
    }
  }, [board, lastMove, onMoveAnimEnd]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // Handle invalid tap — show yellow flash
  const handleInvalidTap = useCallback((row: number, col: number) => {
    const tapId = `tap-${row}-${col}-${Date.now()}`;
    setInvalidTaps((prev) => [...prev, { id: tapId, row, col }]);
    setTimeout(() => {
      setInvalidTaps((prev) => prev.filter((t) => t.id !== tapId));
    }, 400);
  }, []);

  const handleCellClickInternal = useCallback((row: number, col: number) => {
    const isDark = (row + col) % 2 === 1;
    const piece = board[row][col];
    const isLegalTarget = legalMoves.some((m) => m.finalRow === row && m.finalCol === col);
    const canSelect = piece && piece.color === currentTurn;

    // If it's not a legal target and not a selectable piece — show invalid tap
    if (!isDark || (!isLegalTarget && !canSelect)) {
      handleInvalidTap(row, col);
    }

    onCellClick(row, col);
  }, [board, currentTurn, legalMoves, onCellClick, handleInvalidTap]);

  const legalTargets = new Set(legalMoves.map((m) => `${m.finalRow},${m.finalCol}`));
  const legalFromPieces = new Set(legalMoves.map((m) => `${m.fromRow},${m.fromCol}`));

  const rows = flipped
    ? [...Array(8)].map((_, i) => 7 - i)
    : [...Array(8)].map((_, i) => i);
  const cols = flipped
    ? [...Array(8)].map((_, i) => 7 - i)
    : [...Array(8)].map((_, i) => i);

  // Track whether animation has started (need 2-frame approach: render at origin, then animate)
  const [animStarted, setAnimStarted] = useState(false);

  useEffect(() => {
    if (animating && !animStarted) {
      // Use rAF to ensure the piece renders at origin first, then slides
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimStarted(true);
        });
      });
    }
    if (!animating) {
      setAnimStarted(false);
    }
  }, [animating, animStarted]);

  function getCellSlideStyle(
    anim: AnimatingPiece,
    cellSize: number,
    started: boolean,
  ): React.CSSProperties {
    if (!started) {
      return {
        transform: `translate(0px, 0px)`,
        position: "relative",
        zIndex: 30,
      };
    }
    const dr = anim.toRow - anim.fromRow;
    const dc = anim.toCol - anim.fromCol;
    const displayDr = flipped ? -dr : dr;
    const displayDc = flipped ? -dc : dc;
    return {
      transform: `translate(${displayDc * cellSize}px, ${displayDr * cellSize}px)`,
      transition: `transform ${ANIM_DURATION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
      position: "relative",
      zIndex: 30,
    };
  }

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        aspectRatio: "1",
        width: "100%",
        maxWidth: "min(100vw, calc(100vh - 180px))",
        margin: "0 auto",
        border: "8px solid #5D4037",
        outline: "3px solid #8D6E63",
        borderRadius: "6px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.2)",
        background: "#4E342E",
      }}
    >
      {rows.flatMap((row) =>
        cols.map((col) => {
          const isDark = (row + col) % 2 === 1;
          const piece = board[row][col];
          const isSelected = selectedPiece?.row === row && selectedPiece?.col === col;
          const isLegalTarget = legalTargets.has(`${row},${col}`);
          const isLegalFrom = legalFromPieces.has(`${row},${col}`);
          const isLastTo = lastMove?.toRow === row && lastMove?.toCol === col;
          const isLastFrom = lastMove?.fromRow === row && lastMove?.fromCol === col;
          const isAnimOrigin = animating?.fromRow === row && animating?.fromCol === col;
          const isAnimDest = animating?.toRow === row && animating?.toCol === col;
          const hasInvalidTap = invalidTaps.some((t) => t.row === row && t.col === col);

          const canInteract =
            myColor === null
              ? piece?.color === currentTurn
              : myColor === currentTurn;

          const isMoveDot = isDark && isLegalTarget && !piece;
          const isCaptureTarget = isDark && isLegalTarget && !!piece && piece.color !== currentTurn;

          // Cell background
          let cellBg = isDark ? DARK_SQ : LIGHT_SQ;
          if (isSelected && isDark) cellBg = SELECTED_BG;

          return (
            <div
              key={`${row}-${col}`}
              onClick={() => handleCellClickInternal(row, col)}
              className="relative flex items-center justify-center overflow-visible"
              style={{
                aspectRatio: "1",
                background: cellBg,
                cursor: (isDark && isLegalTarget) || (piece && canInteract && isLegalFrom) ? "pointer" : "default",
              }}
            >
              {/* Selected square GREEN glow (matching video) */}
              {isSelected && isDark && (
                <div
                  className="absolute inset-0 pointer-events-none z-5"
                  style={{
                    background: SELECTED_GLOW,
                    boxShadow: "inset 0 0 14px rgba(76, 175, 80, 0.7)",
                  }}
                />
              )}

              {/* Yellow invalid tap flash */}
              {hasInvalidTap && (
                <div
                  className="absolute inset-0 pointer-events-none z-40"
                  style={{
                    background: "rgba(255, 235, 59, 0.55)",
                    animation: "invalidTapFlash 0.4s ease-out forwards",
                  }}
                />
              )}

              {/* Opponent last-move golden highlight */}
              {isDark && isLastTo && highlightLastMove && (
                <div
                  className="absolute inset-0 pointer-events-none z-5"
                  style={{
                    background: "rgba(212, 175, 55, 0.3)",
                    transition: "opacity 0.5s ease",
                  }}
                />
              )}

              {/* Last-move "from" subtle tint */}
              {isDark && isLastFrom && highlightLastMove && (
                <div
                  className="absolute inset-0 pointer-events-none z-5"
                  style={{ background: "rgba(212,175,55,0.12)" }}
                />
              )}

              {/* Legal move dot — GREEN circle outline (matching video) */}
              {isMoveDot && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <div
                    className="rounded-full"
                    style={{
                      width: "38%",
                      height: "38%",
                      background: "transparent",
                      border: `3px solid ${MOVE_DOT_BORDER}`,
                      boxShadow: `0 0 8px ${MOVE_DOT_COLOR}, inset 0 0 4px ${MOVE_DOT_COLOR}`,
                      animation: "greenDotPulse 1.5s ease-in-out infinite",
                    }}
                  />
                </div>
              )}

              {/* Capture target — green ring around enemy piece */}
              {isCaptureTarget && (
                <div
                  className="absolute inset-[6%] rounded-full pointer-events-none z-10"
                  style={{
                    border: "3px solid rgba(76, 175, 80, 0.9)",
                    boxShadow: "0 0 12px rgba(76, 175, 80, 0.7), 0 0 24px rgba(76, 175, 80, 0.4), inset 0 0 8px rgba(76, 175, 80, 0.2)",
                    animation: "greenRingPulse 1.2s ease-in-out infinite",
                  }}
                />
              )}

              {/* Piece (hidden at origin and destination during animation) */}
              {piece && isDark && !isAnimOrigin && !isAnimDest && (
                <div
                  className="absolute inset-[8%] z-20"
                  style={{
                    cursor:
                      canInteract && piece.color === currentTurn && isLegalFrom
                        ? "pointer"
                        : "default",
                  }}
                >
                  <Piece
                    piece={piece}
                    isSelected={isSelected}
                    isLastMoveTo={isLastTo}
                    isLastMoveFrom={false}
                    onClick={() => handleCellClickInternal(row, col)}
                  />
                </div>
              )}

              {/* Sliding animated piece — SMOOTH MOVEMENT (key feature from video) */}
              {animating && animating.fromRow === row && animating.fromCol === col && (
                <div
                  className="absolute inset-[8%] z-40"
                  style={getCellSlideStyle(
                    animating,
                    containerRef.current
                      ? containerRef.current.clientWidth / 8
                      : 50,
                    animStarted,
                  )}
                >
                  <Piece
                    piece={animating.piece}
                    isSelected={false}
                    isLastMoveTo={false}
                    isLastMoveFrom={true}
                    onClick={() => {}}
                  />
                </div>
              )}

              {/* Capture particle explosion */}
              {captureParticles.some((p) => p.row === row && p.col === col) && (
                <div className="absolute inset-0 pointer-events-none z-50 overflow-visible">
                  {[...Array(8)].map((_, i) => {
                    const angle = (i / 8) * 360;
                    const dist = 60 + Math.random() * 30;
                    const dx = Math.cos((angle * Math.PI) / 180) * dist;
                    const dy = Math.sin((angle * Math.PI) / 180) * dist;
                    return (
                      <div
                        key={i}
                        className="absolute"
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: i % 2 === 0 ? "#4CAF50" : "#FFD700",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          animation: `captureParticle 0.65s ease-out forwards`,
                          ["--dx" as string]: `${dx}%`,
                          ["--dy" as string]: `${dy}%`,
                          animationDelay: `${i * 0.03}s`,
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}
