import type { Board, CellState } from "./types.ts";

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isDark = (row + col) % 2 === 1;
      if (!isDark) continue;

      let cell: CellState = null;
      if (row < 3) {
        cell = { color: "black", type: "man" };
      } else if (row > 4) {
        cell = { color: "white", type: "man" };
      }
      board[row][col] = cell;
    }
  }

  return board;
}
