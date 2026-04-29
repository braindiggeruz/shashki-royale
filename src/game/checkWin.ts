import type { Board, PlayerColor } from "./types.ts";
import { generateLegalMoves } from "./rules.ts";

type GameResult =
  | { over: false }
  | { over: true; winner: PlayerColor | "draw"; reason: string };

export function checkGameResult(board: Board, currentTurn: PlayerColor): GameResult {
  // Check if current player has pieces
  let whitePieces = 0;
  let blackPieces = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell?.color === "white") whitePieces++;
      if (cell?.color === "black") blackPieces++;
    }
  }

  if (whitePieces === 0) {
    return { over: true, winner: "black", reason: "Все шашки белых взяты" };
  }
  if (blackPieces === 0) {
    return { over: true, winner: "white", reason: "Все шашки чёрных взяты" };
  }

  // Check if current player has legal moves
  const legalMoves = generateLegalMoves(board, currentTurn);
  if (legalMoves.length === 0) {
    const winner: PlayerColor = currentTurn === "white" ? "black" : "white";
    return { over: true, winner, reason: "Нет доступных ходов" };
  }

  return { over: false };
}
