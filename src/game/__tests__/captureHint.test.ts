import { describe, it, expect } from "vitest";
import { cloneBoard, hasMandatoryCapture, generateLegalMoves } from "../rules.ts";
import { applyMove } from "../applyMove.ts";
import type { Board, PlayerColor } from "../types.ts";

/**
 * These tests mirror the gate the OnlineGame.tsx UI uses to decide whether
 * to render the "Доступно обязательное взятие" hint. The UI rule is:
 *
 *   showCaptureHint =
 *     isParticipant(myColor, playerId) &&
 *     gameStatus === 'playing' &&
 *     !gameState.gameOver &&
 *     !sending &&
 *     gameState.currentTurn === myColor &&
 *     hasMandatoryCapture(board, myColor);
 *
 * Tests below isolate the pure-logic half (hasMandatoryCapture per colour).
 */

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function place(
  board: Board,
  row: number,
  col: number,
  color: PlayerColor,
  type: "man" | "king" = "man",
): Board {
  const b = cloneBoard(board);
  b[row][col] = { color, type };
  return b;
}

/** Helper mirroring the OnlineGame.tsx hasMandatory derivation. */
function captureHintVisible(args: {
  board: Board;
  myColor: PlayerColor | undefined;
  playerId: string | null | undefined;
  gameStatus: string;
  gameOver: boolean;
  sending: boolean;
  currentTurn: PlayerColor;
}): boolean {
  const isParticipant = Boolean(args.myColor && args.playerId);
  const isGamePlaying = args.gameStatus === "playing" && !args.gameOver;
  if (!isParticipant || !isGamePlaying || args.sending) return false;
  if (args.myColor === undefined) return false;
  if (args.currentTurn !== args.myColor) return false;
  return hasMandatoryCapture(args.board, args.myColor);
}

describe("Capture hint visibility (Bug #1)", () => {
  // White man at (5,1), black man at (4,2). Landing (3,3) empty → white can
  // capture. Critically, we also block black's reciprocal capture by placing
  // a wall behind the white piece at (6,0), so the test cases that pin colour
  // can exercise the "opponent turn" branch cleanly.
  let captureBoard: Board;
  let blackHasNoCaptureBoard: Board;
  beforeAll(() => {
    let b = emptyBoard();
    b = place(b, 5, 1, "white");
    b = place(b, 4, 2, "black");
    captureBoard = b;
    // Same as captureBoard but block black's landing square (6,0) so black
    // has no mandatory capture and only white does.
    let b2 = cloneBoard(b);
    b2 = place(b2, 6, 0, "white");
    blackHasNoCaptureBoard = b2;
  });

  it("hides hint on opponent turn even if board has captures for the active side", () => {
    // White CAN capture, but it's BLACK's turn (and black has no captures
    // available). UI must NOT show the hint to black.
    const visible = captureHintVisible({
      board: blackHasNoCaptureBoard,
      myColor: "black",
      playerId: "p1",
      gameStatus: "playing",
      gameOver: false,
      sending: false,
      currentTurn: "black",
    });
    expect(visible).toBe(false);
  });

  it("hides hint when currentTurn does not match playerColor", () => {
    // It's white's mandatory capture, but I'm playing as BLACK. UI must hide.
    const visible = captureHintVisible({
      board: captureBoard,
      myColor: "black",
      playerId: "p1",
      gameStatus: "playing",
      gameOver: false,
      sending: false,
      currentTurn: "white",
    });
    expect(visible).toBe(false);
  });

  it("shows hint only for active player with actual mandatory capture", () => {
    const visible = captureHintVisible({
      board: captureBoard,
      myColor: "white",
      playerId: "p1",
      gameStatus: "playing",
      gameOver: false,
      sending: false,
      currentTurn: "white",
    });
    expect(visible).toBe(true);
  });

  it("hides hint when gameStatus is not 'playing' (e.g. waiting)", () => {
    const visible = captureHintVisible({
      board: captureBoard,
      myColor: "white",
      playerId: "p1",
      gameStatus: "waiting",
      gameOver: false,
      sending: false,
      currentTurn: "white",
    });
    expect(visible).toBe(false);
  });

  it("hides hint after the game is finished", () => {
    const visible = captureHintVisible({
      board: captureBoard,
      myColor: "white",
      playerId: "p1",
      gameStatus: "finished",
      gameOver: true,
      sending: false,
      currentTurn: "white",
    });
    expect(visible).toBe(false);
  });

  it("hides hint when myColor is undefined (spectator / not yet bootstrapped)", () => {
    const visible = captureHintVisible({
      board: captureBoard,
      myColor: undefined,
      playerId: "p1",
      gameStatus: "playing",
      gameOver: false,
      sending: false,
      currentTurn: "white",
    });
    expect(visible).toBe(false);
  });

  it("hides hint when playerId is missing (anon bootstrap not done)", () => {
    const visible = captureHintVisible({
      board: captureBoard,
      myColor: "white",
      playerId: null,
      gameStatus: "playing",
      gameOver: false,
      sending: false,
      currentTurn: "white",
    });
    expect(visible).toBe(false);
  });

  it("hides hint while a move is being sent (sending=true)", () => {
    const visible = captureHintVisible({
      board: captureBoard,
      myColor: "white",
      playerId: "p1",
      gameStatus: "playing",
      gameOver: false,
      sending: true,
      currentTurn: "white",
    });
    expect(visible).toBe(false);
  });

  it("hides hint when no mandatory capture exists for the active player", () => {
    // Plain quiet board — white man with no captures.
    let b = emptyBoard();
    b = place(b, 5, 1, "white");
    const visible = captureHintVisible({
      board: b,
      myColor: "white",
      playerId: "p1",
      gameStatus: "playing",
      gameOver: false,
      sending: false,
      currentTurn: "white",
    });
    expect(visible).toBe(false);
  });

  it("multi-capture state does NOT leak to opponent turn", () => {
    // White has a chain capture; after applying full chain via applyMove,
    // the turn flips to black. Hint visibility for the BLACK player must
    // not be true.
    let b = emptyBoard();
    b = place(b, 5, 1, "white");
    b = place(b, 4, 2, "black");
    b = place(b, 2, 4, "black");

    const moves = generateLegalMoves(b, "white");
    const chainMove = moves.find((m) => m.steps.length >= 2);
    expect(chainMove).toBeDefined();

    const afterBoard = applyMove(b, chainMove!, "white");

    // Now it is black's turn (game state would set currentTurn='black').
    const visibleBlack = captureHintVisible({
      board: afterBoard,
      myColor: "black",
      playerId: "p2",
      gameStatus: "playing",
      gameOver: false,
      sending: false,
      currentTurn: "black",
    });
    expect(visibleBlack).toBe(false);
  });

  it("mandatory capture rule still blocks illegal normal moves", () => {
    // White has a capture available; the only legal moves are captures.
    const legal = generateLegalMoves(captureBoard, "white");
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((m) => m.isCapture)).toBe(true);
  });

  it("hint disappears after turn changes (white captures, black to move)", () => {
    let b = emptyBoard();
    b = place(b, 5, 1, "white");
    b = place(b, 4, 2, "black");
    const moves = generateLegalMoves(b, "white");
    const capture = moves.find((m) => m.isCapture)!;
    const after = applyMove(b, capture, "white");
    // Turn flipped to black. Black has no captures on this board.
    expect(hasMandatoryCapture(after, "black")).toBe(false);
    const visible = captureHintVisible({
      board: after,
      myColor: "black",
      playerId: "p2",
      gameStatus: "playing",
      gameOver: false,
      sending: false,
      currentTurn: "black",
    });
    expect(visible).toBe(false);
  });
});
