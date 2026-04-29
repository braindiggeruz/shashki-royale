import type { Board, GameState } from "./types.ts";

export function serializeBoard(board: Board): string {
  return JSON.stringify(board);
}

export function deserializeBoard(data: string): Board {
  return JSON.parse(data) as Board;
}

export function serializeGameState(state: Omit<GameState, "selectedPiece" | "legalMoves" | "captureChain">): string {
  return JSON.stringify(state);
}

export function deserializeGameState(data: string): Omit<GameState, "selectedPiece" | "legalMoves" | "captureChain"> {
  return JSON.parse(data) as Omit<GameState, "selectedPiece" | "legalMoves" | "captureChain">;
}
