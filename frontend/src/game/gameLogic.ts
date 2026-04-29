import type { GameState, Move, PlayerColor } from "../game/types.ts";
import { createInitialBoard } from "../game/initialBoard.ts";
import { generateLegalMoves, generateLegalMovesForPiece } from "../game/rules.ts";
import { applyMove } from "../game/applyMove.ts";
import { checkGameResult } from "../game/checkWin.ts";

export function createInitialGameState(): GameState {
  const board = createInitialBoard();
  const currentTurn: PlayerColor = "white";
  const legalMoves = generateLegalMoves(board, currentTurn);
  return {
    board,
    currentTurn,
    moveNumber: 1,
    gameOver: false,
    winner: null,
    winReason: null,
    selectedPiece: null,
    legalMoves,
    captureChain: null,
    lastMove: null,
  };
}

export function selectPiece(
  state: GameState,
  row: number,
  col: number,
): GameState {
  if (state.gameOver) return state;

  const piece = state.board[row][col];
  if (!piece || piece.color !== state.currentTurn) {
    return { ...state, selectedPiece: null, legalMoves: generateLegalMoves(state.board, state.currentTurn) };
  }

  const movesForPiece = generateLegalMovesForPiece(
    state.board,
    row,
    col,
    state.currentTurn,
  );

  return {
    ...state,
    selectedPiece: { row, col },
    legalMoves: movesForPiece,
  };
}

export function applyMoveToState(state: GameState, move: Move): GameState {
  const newBoard = applyMove(state.board, move, state.currentTurn);
  const nextTurn: PlayerColor = state.currentTurn === "white" ? "black" : "white";
  const result = checkGameResult(newBoard, nextTurn);

  const nextLegalMoves = result.over
    ? []
    : generateLegalMoves(newBoard, nextTurn);

  return {
    ...state,
    board: newBoard,
    currentTurn: nextTurn,
    moveNumber: state.moveNumber + 1,
    gameOver: result.over,
    winner: result.over ? result.winner : null,
    winReason: result.over ? result.reason : null,
    selectedPiece: null,
    legalMoves: nextLegalMoves,
    captureChain: null,
    lastMove: {
      fromRow: move.fromRow,
      fromCol: move.fromCol,
      toRow: move.finalRow,
      toCol: move.finalCol,
    },
  };
}
