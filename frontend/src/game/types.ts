export type PlayerColor = "white" | "black";
export type PieceType = "man" | "king";

export type CellState = {
  color: PlayerColor;
  type: PieceType;
} | null;

export type Board = CellState[][];

export type CaptureStep = {
  toRow: number;
  toCol: number;
  capturedRow: number;
  capturedCol: number;
};

export type Move = {
  fromRow: number;
  fromCol: number;
  steps: CaptureStep[];
  finalRow: number;
  finalCol: number;
  isCapture: boolean;
  promoted: boolean;
};

export type GameState = {
  board: Board;
  currentTurn: PlayerColor;
  moveNumber: number;
  gameOver: boolean;
  winner: PlayerColor | "draw" | null;
  winReason: string | null;
  selectedPiece: { row: number; col: number } | null;
  legalMoves: Move[];
  captureChain: Move | null; // mid-capture state
  lastMove: { fromRow: number; fromCol: number; toRow: number; toCol: number } | null;
};
