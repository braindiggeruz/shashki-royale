import type { Board, Move, CaptureStep, PlayerColor } from "./types.ts";

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

/**
 * Generate all capture moves for a piece (man or king).
 * Supports multi-capture chains.
 * originRow/originCol track the piece's original starting square across recursive calls.
 */
function generateCapturesForPiece(
  board: Board,
  row: number,
  col: number,
  color: PlayerColor,
  isKing: boolean,
  visitedCaptures: Set<string>,
  currentSteps: CaptureStep[],
  originRow?: number,
  originCol?: number,
): Move[] {
  // On first call, origin equals current position
  const oRow = originRow ?? row;
  const oCol = originCol ?? col;
  const results: Move[] = [];
  const opponent: PlayerColor = color === "white" ? "black" : "white";

  if (isKing) {
    // King: scan all 4 diagonals
    const dirs = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      // Slide until we find a piece or edge
      while (inBounds(r, c) && board[r][c] === null) {
        r += dr;
        c += dc;
      }
      // Found opponent piece
      if (
        inBounds(r, c) &&
        board[r][c] !== null &&
        board[r][c]!.color === opponent
      ) {
        const capturedRow = r;
        const capturedCol = c;
        const captureKey = `${capturedRow},${capturedCol}`;
        if (!visitedCaptures.has(captureKey)) {
          // Land on any empty square beyond captured piece
          let lr = capturedRow + dr;
          let lc = capturedCol + dc;
          while (inBounds(lr, lc) && board[lr][lc] === null) {
            const newBoard = cloneBoard(board);
            newBoard[capturedRow][capturedCol] = null;
            newBoard[row][col] = null;
            newBoard[lr][lc] = { color, type: "king" };

            const step: CaptureStep = {
              toRow: lr,
              toCol: lc,
              capturedRow,
              capturedCol,
            };
            const newSteps = [...currentSteps, step];
            const newVisited = new Set(visitedCaptures);
            newVisited.add(captureKey);

            // Try continuing capture
            const continuations = generateCapturesForPiece(
              newBoard,
              lr,
              lc,
              color,
              true,
              newVisited,
              newSteps,
              oRow,
              oCol,
            );

            if (continuations.length > 0) {
              results.push(...continuations);
            } else {
              results.push({
                fromRow: oRow,
                fromCol: oCol,
                steps: newSteps,
                finalRow: lr,
                finalCol: lc,
                isCapture: true,
                promoted: false,
              });
            }
            lr += dr;
            lc += dc;
          }
        }
      }
    }
  } else {
    // Man: capture in all 4 diagonals
    const dirs = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (const [dr, dc] of dirs) {
      const mr = row + dr;
      const mc = col + dc;
      const lr = row + 2 * dr;
      const lc = col + 2 * dc;

      if (
        inBounds(mr, mc) &&
        inBounds(lr, lc) &&
        board[mr][mc] !== null &&
        board[mr][mc]!.color === opponent &&
        board[lr][lc] === null
      ) {
        const captureKey = `${mr},${mc}`;
        if (!visitedCaptures.has(captureKey)) {
          const willPromote =
            (color === "white" && lr === 0) || (color === "black" && lr === 7);

          const newBoard = cloneBoard(board);
          newBoard[mr][mc] = null;
          newBoard[row][col] = null;
          newBoard[lr][lc] = { color, type: willPromote ? "king" : "man" };

          const step: CaptureStep = {
            toRow: lr,
            toCol: lc,
            capturedRow: mr,
            capturedCol: mc,
          };
          const newSteps = [...currentSteps, step];
          const newVisited = new Set(visitedCaptures);
          newVisited.add(captureKey);

          // Can only continue capture if not just promoted
          if (!willPromote) {
            const continuations = generateCapturesForPiece(
              newBoard,
              lr,
              lc,
              color,
              false,
              newVisited,
              newSteps,
              oRow,
              oCol,
            );
            if (continuations.length > 0) {
              results.push(...continuations);
              continue;
            }
          }

          results.push({
            fromRow: oRow,
            fromCol: oCol,
            steps: newSteps,
            finalRow: lr,
            finalCol: lc,
            isCapture: true,
            promoted: willPromote,
          });
        }
      }
    }
  }

  return results;
}

export function generateCaptureMoves(
  board: Board,
  row: number,
  col: number,
  color: PlayerColor,
): Move[] {
  const piece = board[row][col];
  if (!piece || piece.color !== color) return [];
  const isKing = piece.type === "king";
  return generateCapturesForPiece(board, row, col, color, isKing, new Set(), []);
}

export function generateNonCaptureMoves(
  board: Board,
  row: number,
  col: number,
  color: PlayerColor,
): Move[] {
  const piece = board[row][col];
  if (!piece || piece.color !== color) return [];

  const moves: Move[] = [];

  if (piece.type === "king") {
    const dirs = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c) && board[r][c] === null) {
        moves.push({
          fromRow: row,
          fromCol: col,
          steps: [{ toRow: r, toCol: c, capturedRow: -1, capturedCol: -1 }],
          finalRow: r,
          finalCol: c,
          isCapture: false,
          promoted: false,
        });
        r += dr;
        c += dc;
      }
    }
  } else {
    // Man: forward moves only (white goes up = row-1, black goes down = row+1)
    const forward = color === "white" ? -1 : 1;
    for (const dc of [-1, 1]) {
      const nr = row + forward;
      const nc = col + dc;
      if (inBounds(nr, nc) && board[nr][nc] === null) {
        const willPromote =
          (color === "white" && nr === 0) || (color === "black" && nr === 7);
        moves.push({
          fromRow: row,
          fromCol: col,
          steps: [{ toRow: nr, toCol: nc, capturedRow: -1, capturedCol: -1 }],
          finalRow: nr,
          finalCol: nc,
          isCapture: false,
          promoted: willPromote,
        });
      }
    }
  }

  return moves;
}

export function generateMovesForPiece(
  board: Board,
  row: number,
  col: number,
  color: PlayerColor,
  mustCapture: boolean,
): Move[] {
  if (mustCapture) {
    return generateCaptureMoves(board, row, col, color);
  }
  return generateNonCaptureMoves(board, row, col, color);
}

export function hasMandatoryCapture(board: Board, color: PlayerColor): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell.color === color) {
        if (generateCaptureMoves(board, r, c, color).length > 0) return true;
      }
    }
  }
  return false;
}

export function generateLegalMoves(board: Board, color: PlayerColor): Move[] {
  const mustCapture = hasMandatoryCapture(board, color);
  const moves: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell.color === color) {
        moves.push(...generateMovesForPiece(board, r, c, color, mustCapture));
      }
    }
  }
  return moves;
}

export function generateLegalMovesForPiece(
  board: Board,
  row: number,
  col: number,
  color: PlayerColor,
): Move[] {
  const mustCapture = hasMandatoryCapture(board, color);
  const pieceMoves = generateMovesForPiece(board, row, col, color, mustCapture);
  if (!mustCapture) return pieceMoves;
  // Only show capture moves for pieces that can capture
  return pieceMoves.filter((m) => m.isCapture);
}

export function validateMove(
  board: Board,
  move: Move,
  color: PlayerColor,
): boolean {
  const legal = generateLegalMoves(board, color);
  return legal.some(
    (m) =>
      m.fromRow === move.fromRow &&
      m.fromCol === move.fromCol &&
      m.finalRow === move.finalRow &&
      m.finalCol === move.finalCol &&
      m.steps.length === move.steps.length,
  );
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/**
 * Get continuation capture moves after completing a step in a multi-capture.
 */
export function getContinuationCaptures(
  board: Board,
  row: number,
  col: number,
  color: PlayerColor,
  alreadyCaptured: Set<string>,
): Move[] {
  const piece = board[row][col];
  if (!piece) return [];
  return generateCapturesForPiece(
    board,
    row,
    col,
    color,
    piece.type === "king",
    alreadyCaptured,
    [],
  );
}
