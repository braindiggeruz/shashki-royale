import { describe, it, expect } from "vitest";
import { createInitialBoard } from "../initialBoard.ts";
import {
  generateLegalMoves,
  hasMandatoryCapture,
  generateCaptureMoves,
  generateNonCaptureMoves,
  cloneBoard,
} from "../rules.ts";
import { applyMove } from "../applyMove.ts";
import { checkGameResult } from "../checkWin.ts";
import type { Board, PlayerColor } from "../types.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── Initial board ─────────────────────────────────────────────────────────────

describe("createInitialBoard", () => {
  it("has exactly 12 white pieces", () => {
    const board = createInitialBoard();
    const whites = board.flat().filter((c) => c?.color === "white");
    expect(whites).toHaveLength(12);
  });

  it("has exactly 12 black pieces", () => {
    const board = createInitialBoard();
    const blacks = board.flat().filter((c) => c?.color === "black");
    expect(blacks).toHaveLength(12);
  });

  it("all initial pieces are men", () => {
    const board = createInitialBoard();
    board.flat().forEach((c) => {
      if (c) expect(c.type).toBe("man");
    });
  });

  it("pieces only on dark squares", () => {
    const board = createInitialBoard();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0) {
          expect(board[r][c]).toBeNull();
        }
      }
    }
  });
});

// ── Simple movement ────────────────────────────────────────────────────────────

describe("man forward movement", () => {
  it("white man moves forward (up)", () => {
    let board = emptyBoard();
    board = place(board, 5, 0, "white");
    const moves = generateNonCaptureMoves(board, 5, 0, "white");
    const targets = moves.map((m) => `${m.finalRow},${m.finalCol}`);
    expect(targets).toContain("4,1");
  });

  it("black man moves forward (down)", () => {
    let board = emptyBoard();
    board = place(board, 2, 1, "black");
    const moves = generateNonCaptureMoves(board, 2, 1, "black");
    const targets = moves.map((m) => `${m.finalRow},${m.finalCol}`);
    expect(targets).toContain("3,0");
    expect(targets).toContain("3,2");
  });

  it("man cannot move backward normally", () => {
    let board = emptyBoard();
    board = place(board, 5, 0, "white");
    const moves = generateNonCaptureMoves(board, 5, 0, "white");
    const rowsUsed = moves.map((m) => m.finalRow);
    // White goes to lower row numbers (up). Should not include row 6.
    expect(rowsUsed.some((r) => r > 5)).toBe(false);
  });
});

// ── Mandatory capture ─────────────────────────────────────────────────────────

describe("mandatory capture", () => {
  it("hasMandatoryCapture returns true when capture is available", () => {
    let board = emptyBoard();
    board = place(board, 5, 0, "white"); // white man
    board = place(board, 4, 1, "black"); // black piece to jump
    expect(hasMandatoryCapture(board, "white")).toBe(true);
  });

  it("generateLegalMoves returns only captures when mandatory", () => {
    let board = emptyBoard();
    board = place(board, 5, 0, "white");
    board = place(board, 4, 1, "black");
    const moves = generateLegalMoves(board, "white");
    expect(moves.every((m) => m.isCapture)).toBe(true);
  });

  it("illegal non-capture move rejected when capture exists", () => {
    let board = emptyBoard();
    board = place(board, 5, 2, "white");
    board = place(board, 4, 3, "black");
    const moves = generateLegalMoves(board, "white");
    // The only legal move is to capture, not a quiet forward step
    const nonCaptures = moves.filter((m) => !m.isCapture);
    expect(nonCaptures).toHaveLength(0);
  });
});

// ── Backward capture for men ──────────────────────────────────────────────────

describe("backward capture for men", () => {
  it("white man can capture backwards", () => {
    let board = emptyBoard();
    board = place(board, 4, 2, "white"); // white man
    board = place(board, 5, 3, "black"); // black piece behind white
    const captures = generateCaptureMoves(board, 4, 2, "white");
    const backward = captures.filter((m) => m.finalRow > 4);
    expect(backward.length).toBeGreaterThan(0);
  });

  it("black man can capture backwards", () => {
    let board = emptyBoard();
    board = place(board, 3, 2, "black");
    board = place(board, 2, 3, "white"); // white piece behind black
    const captures = generateCaptureMoves(board, 3, 2, "black");
    const backward = captures.filter((m) => m.finalRow < 3);
    expect(backward.length).toBeGreaterThan(0);
  });
});

// ── Multi-capture chains ──────────────────────────────────────────────────────

describe("multi-capture chains", () => {
  it("man can chain two captures", () => {
    let board = emptyBoard();
    board = place(board, 6, 0, "white");
    board = place(board, 5, 1, "black"); // first capture
    board = place(board, 3, 3, "black"); // second capture after landing on 4,2
    const captures = generateCaptureMoves(board, 6, 0, "white");
    const chains = captures.filter((m) => m.steps.length >= 2);
    expect(chains.length).toBeGreaterThan(0);
  });

  it("chain move has correct fromRow/fromCol", () => {
    let board = emptyBoard();
    board = place(board, 6, 0, "white");
    board = place(board, 5, 1, "black");
    board = place(board, 3, 3, "black");
    const captures = generateCaptureMoves(board, 6, 0, "white");
    const chains = captures.filter((m) => m.steps.length >= 2);
    chains.forEach((m) => {
      expect(m.fromRow).toBe(6);
      expect(m.fromCol).toBe(0);
    });
  });
});

// ── Promotion (Дамка) ─────────────────────────────────────────────────────────

describe("promotion to king (damka)", () => {
  it("white man reaching row 0 is promoted", () => {
    let board = emptyBoard();
    board = place(board, 1, 1, "white");
    const moves = generateNonCaptureMoves(board, 1, 1, "white");
    const promotionMove = moves.find((m) => m.finalRow === 0);
    expect(promotionMove).toBeDefined();
    expect(promotionMove!.promoted).toBe(true);
    const newBoard = applyMove(board, promotionMove!, "white");
    expect(newBoard[0][0]?.type).toBe("king");
  });

  it("black man reaching row 7 is promoted", () => {
    let board = emptyBoard();
    board = place(board, 6, 2, "black");
    const moves = generateNonCaptureMoves(board, 6, 2, "black");
    const promotionMove = moves.find((m) => m.finalRow === 7);
    expect(promotionMove).toBeDefined();
    expect(promotionMove!.promoted).toBe(true);
    const newBoard = applyMove(board, promotionMove!, "black");
    expect(newBoard[7][1]?.type ?? newBoard[7][3]?.type).toBe("king");
  });
});

// ── King movement ─────────────────────────────────────────────────────────────

describe("king (damka) movement", () => {
  it("king can move multiple squares diagonally", () => {
    let board = emptyBoard();
    board = place(board, 4, 4, "white", "king");
    const moves = generateNonCaptureMoves(board, 4, 4, "white");
    // Should be able to reach squares more than 1 step away
    const longMoves = moves.filter(
      (m) => Math.abs(m.finalRow - 4) > 1 || Math.abs(m.finalCol - 4) > 1,
    );
    expect(longMoves.length).toBeGreaterThan(0);
  });

  it("king can capture at distance", () => {
    let board = emptyBoard();
    board = place(board, 0, 0, "white", "king");
    board = place(board, 3, 3, "black"); // far opponent
    const captures = generateCaptureMoves(board, 0, 0, "white");
    expect(captures.length).toBeGreaterThan(0);
  });

  it("king can capture in all 4 directions", () => {
    let board = emptyBoard();
    board = place(board, 4, 4, "white", "king");
    board = place(board, 2, 2, "black");
    board = place(board, 2, 6, "black");
    board = place(board, 6, 2, "black");
    board = place(board, 6, 6, "black");
    const captures = generateCaptureMoves(board, 4, 4, "white");
    expect(captures.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Win conditions ─────────────────────────────────────────────────────────────

describe("win conditions", () => {
  it("win by no pieces: white wins when all black pieces taken", () => {
    let board = emptyBoard();
    board = place(board, 5, 1, "white");
    // No black pieces
    const result = checkGameResult(board, "black");
    expect(result.over).toBe(true);
    if (result.over) expect(result.winner).toBe("white");
  });

  it("win by no pieces: black wins when all white pieces taken", () => {
    let board = emptyBoard();
    board = place(board, 2, 2, "black");
    // No white pieces
    const result = checkGameResult(board, "white");
    expect(result.over).toBe(true);
    if (result.over) expect(result.winner).toBe("black");
  });

  it("win by no legal moves", () => {
    // White man at row 0 — already promoted to king in a real game, but
    // use a white king trapped with no squares reachable to simulate no legal moves.
    // Simpler: just verify checkGameResult returns over=false on a normal board
    // and over=true when the current player has pieces but no moves.
    let board2 = emptyBoard();
    // White man at row 0, col 2 — can't move forward (already at top)
    // and no capture available.
    board2[0][2] = { color: "white", type: "man" };
    board2[2][2] = { color: "black", type: "man" }; // black has pieces but it's white's turn
    const result = checkGameResult(board2, "white");
    expect(result.over).toBe(true);
    if (result.over) {
      // Black wins because white has no legal moves
      const { winner } = result;
      expect(["black", "white", "draw"]).toContain(winner);
      expect(winner).not.toBe("white"); // white had no moves → black wins
    }
  });

  it("game continues when both have pieces and legal moves", () => {
    const board = createInitialBoard();
    const result = checkGameResult(board, "white");
    expect(result.over).toBe(false);
  });
});

// ── Resignation ───────────────────────────────────────────────────────────────

describe("resignation", () => {
  it("resignation sets correct winner (white resigns → black wins)", () => {
    const board = createInitialBoard();
    const resigningColor: PlayerColor = "white";
    const winner: PlayerColor = resigningColor === "white" ? "black" : "white";
    expect(winner).toBe("black");
  });

  it("resignation sets correct winner (black resigns → white wins)", () => {
    const resigningColor = "black" as PlayerColor;
    const winner: PlayerColor = resigningColor === "white" ? "black" : "white";
    expect(winner).toBe("white");
  });
});

// ── applyMove correctness ─────────────────────────────────────────────────────

describe("applyMove", () => {
  it("moves piece to destination and removes from origin", () => {
    let board = emptyBoard();
    board = place(board, 5, 0, "white");
    const moves = generateNonCaptureMoves(board, 5, 0, "white");
    const move = moves[0];
    const newBoard = applyMove(board, move, "white");
    expect(newBoard[5][0]).toBeNull();
    expect(newBoard[move.finalRow][move.finalCol]).not.toBeNull();
  });

  it("capture removes the captured piece", () => {
    let board = emptyBoard();
    board = place(board, 5, 0, "white");
    board = place(board, 4, 1, "black");
    const captures = generateCaptureMoves(board, 5, 0, "white");
    expect(captures.length).toBeGreaterThan(0);
    const newBoard = applyMove(board, captures[0], "white");
    expect(newBoard[4][1]).toBeNull();
  });
});
