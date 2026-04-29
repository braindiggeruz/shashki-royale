import type { Board, Move, PlayerColor } from "./types.ts";
import { cloneBoard } from "./rules.ts";

export function applyMove(board: Board, move: Move, color: PlayerColor): Board {
  const newBoard = cloneBoard(board);
  const piece = newBoard[move.fromRow][move.fromCol];
  if (!piece) return newBoard;

  // Remove piece from origin
  newBoard[move.fromRow][move.fromCol] = null;

  // Remove captured pieces
  for (const step of move.steps) {
    if (step.capturedRow >= 0) {
      newBoard[step.capturedRow][step.capturedCol] = null;
    }
  }

  // Place piece at destination
  const promoted =
    move.promoted ||
    (piece.type === "man" &&
      ((color === "white" && move.finalRow === 0) ||
        (color === "black" && move.finalRow === 7)));

  newBoard[move.finalRow][move.finalCol] = {
    color: piece.color,
    type: promoted ? "king" : piece.type,
  };

  return newBoard;
}

export function promoteIfNeeded(board: Board): Board {
  const newBoard = cloneBoard(board);
  for (let col = 0; col < 8; col++) {
    const whitePromote = newBoard[0][col];
    if (whitePromote && whitePromote.color === "white" && whitePromote.type === "man") {
      newBoard[0][col] = { color: "white", type: "king" };
    }
    const blackPromote = newBoard[7][col];
    if (blackPromote && blackPromote.color === "black" && blackPromote.type === "man") {
      newBoard[7][col] = { color: "black", type: "king" };
    }
  }
  return newBoard;
}
