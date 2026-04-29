import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { ChevronLeft, AlertCircle, Flag, WifiOff, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import BoardView from "../components/Board.tsx";
import GameOverModal from "../components/GameOverModal.tsx";
import { GameResultModal, type GameResult } from "../components/GameResultModal.tsx";
import DebugPanel from "../components/DebugPanel.tsx";
import PlayerCard from "../components/PlayerCard.tsx";
import { supabase, supabaseConfigured, setPlayerContext } from "../lib/supabase.ts";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  fetchGame,
  updateGameState,
  finishGame,
  insertMove,
  type GameRow,
} from "../services/gameRooms.ts";
import { processGameResult, getOrCreateProfile, type Profile } from "../services/profiles.ts";
import {
  generateLegalMoves,
  generateLegalMovesForPiece,
  hasMandatoryCapture,
} from "../game/rules.ts";
import { applyMove } from "../game/applyMove.ts";
import { checkGameResult } from "../game/checkWin.ts";
import type { GameState, PlayerColor, Board } from "../game/types.ts";
import { createInitialBoard } from "../game/initialBoard.ts";
import {
  saveActiveGame,
  clearActiveGame,
  loadActiveGame,
} from "../lib/storage.ts";
import { useAudio } from "../hooks/use-audio.ts";
import { useGameResult } from "../hooks/useGameResult.ts";
import { usePlayerId } from "../hooks/usePlayerId";

type OnlineGameLocationState = {
  gameId: string;
  myColor: PlayerColor;
};

type LastMove = {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
};

function isValidColor(c: string | null): c is PlayerColor {
  return c === "white" || c === "black";
}

function resolveGameParams(
  locationState: Partial<OnlineGameLocationState>,
  searchParams: URLSearchParams,
): { gameId: string | undefined; myColor: PlayerColor | undefined } {
  if (locationState.gameId && locationState.myColor) {
    return { gameId: locationState.gameId, myColor: locationState.myColor };
  }
  const urlGameId = searchParams.get("gameId") ?? undefined;
  const urlColor = searchParams.get("color");
  if (urlGameId && isValidColor(urlColor)) {
    return { gameId: urlGameId, myColor: urlColor };
  }
  const saved = loadActiveGame();
  if (saved) {
    return { gameId: saved.gameId, myColor: saved.playerColor };
  }
  return { gameId: undefined, myColor: undefined };
}

export default function OnlineGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { play } = useAudio();
  const { playerId } = usePlayerId();

  const locationState = (location.state ?? {}) as Partial<OnlineGameLocationState>;
  const { gameId, myColor } = resolveGameParams(locationState, searchParams);

  // Update URL so page can be refreshed
  useEffect(() => {
    if (gameId && myColor) {
      const current = searchParams.get("gameId");
      if (current !== gameId) {
        window.history.replaceState(null, "", `/online-game?gameId=${gameId}&color=${myColor}`);
      }
      const saved = loadActiveGame();
      if (saved?.gameId !== gameId) {
        saveActiveGame({
          gameId,
          roomCode: saved?.roomCode ?? "",
          playerId: saved?.playerId ?? "",
          playerColor: myColor,
          savedAt: Date.now(),
        });
      }
    }
  }, [gameId, myColor, searchParams]);

  const [gameState, setGameState] = useState<GameState>(() => {
    const board = createInitialBoard();
    return {
      board,
      currentTurn: "white",
      moveNumber: 1,
      gameOver: false,
      winner: null,
      winReason: null,
      selectedPiece: null,
      legalMoves: generateLegalMoves(board, "white"),
      captureChain: null,
      lastMove: null,
    };
  });

  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roomCodeDisplay, setRoomCodeDisplay] = useState("");
  const [lastUpdateTs, setLastUpdateTs] = useState<number>(0);
  // "Opponent moved" flash indicator
  const [showOpponentMoved, setShowOpponentMoved] = useState(false);
  const [stakeResult, setStakeResult] = useState<GameResult | null>(null);
  const [isProcessingResult, setIsProcessingResult] = useState(false);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<Profile | null>(null);
  const { handleFinishGame } = useGameResult();
  const opponentMovedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appliedMoveNumberRef = useRef(0);
  const lastOpponentActivityRef = useRef(Date.now());
  const gameOverRef = useRef(false);
  const lastSentMoveNumberRef = useRef(0);
  // Channel ref for reconnect — typed as the Supabase RealtimeChannel
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!gameId || !myColor) navigate("/lobby");
  }, [gameId, myColor, navigate]);

  // Flash "opponent moved" indicator
  const showOpponentMovedIndicator = useCallback(() => {
    setShowOpponentMoved(true);
    if (opponentMovedTimerRef.current) clearTimeout(opponentMovedTimerRef.current);
    opponentMovedTimerRef.current = setTimeout(() => setShowOpponentMoved(false), 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (opponentMovedTimerRef.current) clearTimeout(opponentMovedTimerRef.current);
    };
  }, []);

  const applyGameRow = useCallback(
    (game: GameRow, isOpponentMove: boolean) => {
      if (game.move_number <= appliedMoveNumberRef.current) return;

      appliedMoveNumberRef.current = game.move_number;
      lastOpponentActivityRef.current = Date.now();
      setLastUpdateTs(Date.now());
      setConnectionLost(false);

      const board = game.board_state as Board;
      const currentTurn = game.current_turn as PlayerColor;
      const isFinished = game.status === "finished";
      const legalMoves = isFinished ? [] : generateLegalMoves(board, currentTurn);

      if (isFinished) {
        gameOverRef.current = true;
        clearActiveGame();
      }

      setRoomCodeDisplay(game.room_code);

      if (isOpponentMove && game.last_from_row != null && game.last_from_col != null) {
        setLastMove({
          fromRow: game.last_from_row as number,
          fromCol: game.last_from_col as number,
          toRow: game.last_to_row as number,
          toCol: game.last_to_col as number,
        });
        // Show opponent-moved indicator
        showOpponentMovedIndicator();
      }

      setGameState((prev) => ({
        ...prev,
        board,
        currentTurn,
        moveNumber: game.move_number,
        gameOver: isFinished,
        winner: (game.winner as PlayerColor | null) ?? null,
        winReason: game.resign_reason ?? null,
        selectedPiece: null,
        legalMoves,
        captureChain: null,
      }));

      if (game.black_player_id) setOpponentConnected(true);
      if (isOpponentMove && !isFinished) play("move");
    },
    [play, showOpponentMovedIndicator],
  );

  // Subscribe/resubscribe to realtime channel
  const subscribeToChannel = useCallback(
    (gId: string, cancelled: { v: boolean }) => {
      if (!supabase) return;
      // Remove old channel if exists
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current).catch(() => null);
      }

      const channel = supabase
        .channel(`game_state:${gId}:${Date.now()}`, { config: { broadcast: { self: false } } })
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "games",
            filter: `id=eq.${gId}`,
          },
          (payload) => {
            if (cancelled.v) return;
            const updated = payload.new as GameRow;
            const isOurMove = updated.move_number === lastSentMoveNumberRef.current;
            applyGameRow(updated, !isOurMove);
            setConnectionLost(false);
          },
        )
        .subscribe((status) => {
          if (cancelled.v) return;
          if (status === "SUBSCRIBED") {
            setRealtimeConnected(true);
            setConnectionLost(false);
          }
          if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            setRealtimeConnected(false);
            // Attempt reconnect after 2s
            if (!cancelled.v && !gameOverRef.current) {
              setTimeout(() => {
                if (!cancelled.v && !gameOverRef.current) {
                  subscribeToChannel(gId, cancelled);
                }
              }, 2000);
            }
          }
        });

      channelRef.current = channel;
    },
    [applyGameRow],
  );

  // Load + subscribe + polling
  useEffect(() => {
    if (!gameId || !myColor || !supabase) return;

    const cancelled = { v: false };

    const loadGame = async () => {
      const game = await fetchGame(gameId);
      if (cancelled.v) return;
      if (!game) {
        setLoadError("Партия не найдена");
        clearActiveGame();
        return;
      }
      appliedMoveNumberRef.current = game.move_number - 1;
      applyGameRow(game, false);

      // Load player profiles
      if (game.white_player_id) {
        try {
          const whiteProfile = await getOrCreateProfile(game.white_player_id);
          if (cancelled.v) return;
          if (myColor === "white") setMyProfile(whiteProfile.profile);
          else setOpponentProfile(whiteProfile.profile);
        } catch (err) {
          console.error("[OnlineGame] Failed to load white profile:", err);
        }
      }
      if (game.black_player_id) {
        try {
          const blackProfile = await getOrCreateProfile(game.black_player_id);
          if (cancelled.v) return;
          if (myColor === "black") setMyProfile(blackProfile.profile);
          else setOpponentProfile(blackProfile.profile);
        } catch (err) {
          console.error("[OnlineGame] Failed to load black profile:", err);
        }
      }

      const saved = loadActiveGame();
      if (saved && saved.gameId === gameId && !saved.roomCode) {
        saveActiveGame({ ...saved, roomCode: game.room_code, savedAt: Date.now() });
      }
    };

    loadGame();
    subscribeToChannel(gameId, cancelled);

    // Polling fallback every 3s
    const pollId = setInterval(async () => {
      if (cancelled.v || gameOverRef.current) return;
      const game = await fetchGame(gameId);
      if (!game || cancelled.v) return;
      if (game.black_player_id) setOpponentConnected(true);
      const isOurMove = game.move_number === lastSentMoveNumberRef.current;
      applyGameRow(game, !isOurMove);
    }, 3000);

    // Heartbeat: update last_seen every 10s
    const heartbeatId = setInterval(async () => {
      if (cancelled.v || gameOverRef.current || !gameId) return;
      // We track activity client-side; polling already syncs state
      lastOpponentActivityRef.current = Date.now();
    }, 10000);

    // Show "connection lost" only after 15s of no updates
    const connCheckId = setInterval(() => {
      if (cancelled.v || gameOverRef.current) return;
      const elapsed = Date.now() - lastOpponentActivityRef.current;
      if (elapsed > 15_000 && opponentConnected) {
        setConnectionLost(true);
      }
    }, 5000);

    return () => {
      cancelled.v = true;
      clearInterval(pollId);
      clearInterval(heartbeatId);
      clearInterval(connCheckId);
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current).catch(() => null);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, myColor, applyGameRow, subscribeToChannel]);

  // Opponent disconnect detection
  useEffect(() => {
    if (!opponentConnected || !gameId) return;
    const interval = setInterval(() => {
      if (gameOverRef.current) return;
      const elapsed = Date.now() - lastOpponentActivityRef.current;
      const isTheirTurn = gameState.currentTurn !== myColor;
      if (elapsed > 45_000 && isTheirTurn) {
        setOpponentLeft(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [opponentConnected, gameId, gameState.currentTurn, myColor]);

  const isMyTurn = gameState.currentTurn === myColor;

  const handleCellClick = useCallback(
    async (row: number, col: number) => {
      if (!isMyTurn || gameState.gameOver || sending || !gameId || !myColor) return;

      const { board, currentTurn, selectedPiece, legalMoves } = gameState;

      if (selectedPiece) {
        const matchingMove = legalMoves.find(
          (m) => m.finalRow === row && m.finalCol === col,
        );
        if (matchingMove) {
          setSending(true);
          setSyncError(null);

          const newBoard = applyMove(board, matchingMove, currentTurn);
          const nextTurn: PlayerColor = currentTurn === "white" ? "black" : "white";
          const result = checkGameResult(newBoard, nextTurn);
          const newMoveNumber = gameState.moveNumber + 1;

          appliedMoveNumberRef.current = newMoveNumber;
          lastSentMoveNumberRef.current = newMoveNumber;
          gameOverRef.current = result.over;

          if (result.over) clearActiveGame();

          setLastMove({
            fromRow: matchingMove.fromRow,
            fromCol: matchingMove.fromCol,
            toRow: matchingMove.finalRow,
            toCol: matchingMove.finalCol,
          });

          if (matchingMove.isCapture) play("capture");
          else play("move");
          if (matchingMove.promoted) setTimeout(() => play("promote"), 150);

          const nextLegal = result.over ? [] : generateLegalMoves(newBoard, nextTurn);
          setGameState((prev) => ({
            ...prev,
            board: newBoard,
            currentTurn: nextTurn,
            moveNumber: newMoveNumber,
            gameOver: result.over,
            winner: result.over ? result.winner : null,
            winReason: result.over ? result.reason : null,
            selectedPiece: null,
            legalMoves: nextLegal,
            captureChain: null,
          }));

          try {
            if (result.over) {
              await finishGame(
                gameId,
                newBoard,
                result.winner === "draw" ? null : result.winner,
                result.reason,
                newMoveNumber,
                myColor,
              );
              play(result.winner === myColor ? "win" : result.winner === "draw" ? "win" : "lose");
              // Обрабатываем ставки через защищённый RPC
              try {
                setIsProcessingResult(true);
                // playerId уже получен из usePlayerId() хука
                
                // Check if it's a stake game by trying to process it as one
                const stakeResultData = await handleFinishGame(
                  gameId,
                  result.winner as "white" | "black" | "draw",
                  result.reason,
                  playerId
                );
                
                if (stakeResultData.result) {
                  setStakeResult(stakeResultData.result);
                } else {
                  // Not a stake game or error, fallback to standard profile update
                  await processGameResult(
                    gameId,
                    result.winner === "draw" ? null : (result.winner === myColor ? myColor : (myColor === "white" ? "black" : "white")),
                    result.reason,
                    myColor,
                  );
                }
              } catch (stakeErr) {
                console.error("[OnlineGame] processGameResult error:", stakeErr);
              } finally {
                setIsProcessingResult(false);
              }
            } else {
              await updateGameState(
                gameId,
                newBoard,
                nextTurn,
                newMoveNumber,
                myColor,
                matchingMove.fromRow,
                matchingMove.fromCol,
                matchingMove.finalRow,
                matchingMove.finalCol,
              );
            }
            insertMove(gameId, gameState.moveNumber, currentTurn, matchingMove, newBoard, myColor).catch(() => null);
          } catch (syncErr) {
            console.error("[OnlineGame] Sync error, rolling back:", syncErr);
            // ОТКАТ: восстанавливаем предыдущий стейт
            setGameState(gameState);
            appliedMoveNumberRef.current = gameState.moveNumber;
            gameOverRef.current = false;
            setSyncError("Ошибка сети — ход не отправлен. Попробуйте ещё раз.");
          } finally {
            setSending(false);
          }
          return;
        }
      }

      const piece = board[row][col];
      if (piece && piece.color === currentTurn) {
        const mustCapture = hasMandatoryCapture(board, currentTurn);
        const movesForPiece = generateLegalMovesForPiece(board, row, col, currentTurn);
        if (mustCapture && movesForPiece.filter((m) => m.isCapture).length === 0) return;
        setGameState((prev) => ({
          ...prev,
          selectedPiece: { row, col },
          legalMoves: movesForPiece,
        }));
        return;
      }

      setGameState((prev) => ({
        ...prev,
        selectedPiece: null,
        legalMoves: generateLegalMoves(prev.board, prev.currentTurn),
      }));
    },
    [isMyTurn, gameState, sending, gameId, myColor, play, playerId, handleFinishGame],
  );

  const handleResign = async () => {
    if (!gameId || !myColor) return;
    const winner: PlayerColor = myColor === "white" ? "black" : "white";
    const reason = `${myColor === "white" ? "Белые" : "Чёрные"} сдались`;
    setShowResignConfirm(false);
    gameOverRef.current = true;
    clearActiveGame();
    setGameState((prev) => ({ ...prev, gameOver: true, winner, winReason: reason }));
    play("lose");
    await finishGame(gameId, gameState.board, winner, reason, gameState.moveNumber, myColor);
  };

  const handleOpponentLeftWin = async () => {
    if (!gameId || !myColor) return;
    const reason = "Соперник вышел из игры";
    gameOverRef.current = true;
    clearActiveGame();
    setOpponentLeft(false);
    setGameState((prev) => ({ ...prev, gameOver: true, winner: myColor, winReason: reason }));
    play("win");
    await finishGame(gameId, gameState.board, myColor, reason, gameState.moveNumber, myColor);
  };

  const hasMandatory = isMyTurn && !gameState.gameOver && gameState.legalMoves.some((m) => m.isCapture);
  const flipped = myColor === "black";

  if (loadError) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center px-6 gap-5"
        style={{ background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)" }}
      >
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-center text-sm font-medium" style={{ color: "rgba(255,150,100,0.9)" }}>
          {loadError}
        </p>
        <button
          onClick={() => navigate("/")}
          className="py-2.5 px-6 cursor-pointer"
          style={{
            borderRadius: "12px",
            background: "rgba(212,175,55,0.1)",
            border: "1px solid rgba(212,175,55,0.3)",
            color: "#FFD700",
            fontFamily: "Cinzel, serif",
          }}
        >
          На главный экран
        </button>
      </div>
    );
  }

  if (!supabaseConfigured) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center px-6 gap-5"
        style={{ background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)" }}
      >
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-center text-sm" style={{ color: "rgba(255,150,100,0.9)" }}>
          Онлайн-режим не настроен. Проверьте подключение Supabase.
        </p>
        <button
          onClick={() => navigate("/")}
          className="text-sm cursor-pointer"
          style={{ color: "#FFD700" }}
        >
          На главный экран
        </button>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(212,175,55,0.15)" }}
      >
        <button
          onClick={() => { clearActiveGame(); navigate("/"); }}
          className="p-2 cursor-pointer rounded-xl"
          style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.12)" }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: "#D4AF37" }} />
        </button>

        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <div
              className={`w-2 h-2 rounded-full transition-colors ${
                connectionLost
                  ? "bg-red-400"
                  : opponentConnected
                  ? "bg-green-400"
                  : "bg-yellow-400 animate-pulse"
              }`}
            />
            <p
              className="text-xs uppercase tracking-widest"
              style={{ color: "rgba(212,175,55,0.6)", fontFamily: "Cinzel, serif" }}
            >
              {connectionLost ? "Нет связи" : opponentConnected ? "Онлайн" : "Ожидание..."}
            </p>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "rgba(212,175,55,0.4)" }}>
            Ход {gameState.moveNumber}
          </p>
        </div>

        <button
          onClick={() => setShowResignConfirm(true)}
          className="p-2 cursor-pointer rounded-xl"
          style={{ background: "rgba(180,30,0,0.2)", border: "1px solid rgba(200,50,30,0.2)" }}
        >
          <Flag className="w-5 h-5 text-red-400" />
        </button>
      </div>

      {/* Turn + warnings */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0 space-y-2">
        <motion.div
          key={`${gameState.currentTurn}-${isMyTurn}`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 py-2 rounded-xl"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          {/* Piece color indicator */}
          <div
            className="w-5 h-5 rounded-full border-2 flex-shrink-0"
            style={{
              background:
                gameState.currentTurn === "white"
                  ? "radial-gradient(circle at 35% 35%, #FFFFFF 0%, #D4B896 100%)"
                  : "radial-gradient(circle at 35% 35%, #555 0%, #000 100%)",
              borderColor: "#D4AF37",
            }}
          />
          <span
            className="font-semibold text-sm"
            style={{
              fontFamily: "Cinzel, serif",
              color: sending
                ? "rgba(212,175,55,0.5)"
                : isMyTurn
                ? "#FFD700"
                : "rgba(255,255,255,0.5)",
            }}
          >
            {sending ? "Отправка..." : isMyTurn ? "Ваш ход" : "Ход соперника"}
          </span>
        </motion.div>

        <AnimatePresence>
          {/* "Opponent moved" flash */}
          {showOpponentMoved && (
            <motion.div
              key="oppmoved"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2 py-1.5 px-3 rounded-lg"
              style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)" }}
            >
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#D4AF37" }} />
              <span className="text-xs" style={{ color: "#FFD700" }}>Противник походил ✓</span>
            </motion.div>
          )}
          {hasMandatory && !sending && (
            <motion.div
              key="mandatory"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 py-1.5 px-3 rounded-lg"
              style={{ background: "rgba(220, 50, 0, 0.15)", border: "1px solid rgba(220,80,0,0.3)" }}
            >
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-300">Взятие обязательно!</span>
            </motion.div>
          )}
          {connectionLost && (
            <motion.div
              key="connlost"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 py-1.5 px-3 rounded-lg"
              style={{ background: "rgba(150, 100, 0, 0.2)", border: "1px solid rgba(200,150,0,0.3)" }}
            >
              <WifiOff className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span className="text-xs text-yellow-300">Соединение нестабильно... Переподключение</span>
            </motion.div>
          )}
          {syncError && (
            <motion.div
              key="syncerr"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 py-1.5 px-3 rounded-lg"
              style={{ background: "rgba(200, 50, 0, 0.2)", border: "1px solid rgba(220,80,0,0.35)" }}
            >
              <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0" />
              <span className="text-xs text-red-300">{syncError}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* My color badge */}
      <div className="px-4 pb-1 flex-shrink-0 text-center">
        <span className="text-xs" style={{ color: "rgba(212,175,55,0.4)" }}>
          Вы:{" "}
          <span
            style={{
              color: myColor === "white" ? "#FFD700" : "rgba(220,220,220,0.7)",
              fontWeight: 600,
            }}
          >
            {myColor === "white" ? "белые" : "чёрные"}
          </span>
        </span>
      </div>

      {/* Opponent Player Card (top) */}
      {myColor === "black" && (
        <div className="px-4 py-2">
          <PlayerCard
            profile={opponentProfile}
            color="white"
            isActive={gameState.currentTurn === "white"}
          />
        </div>
      )}
      {myColor === "white" && (
        <div className="px-4 py-2">
          <PlayerCard
            profile={opponentProfile}
            color="black"
            isActive={gameState.currentTurn === "black"}
          />
        </div>
      )}

      {/* Board */}
      <div className="flex-1 flex items-center justify-center px-2 py-1 min-h-0 max-h-[60vh]">
        <BoardView
          board={gameState.board}
          currentTurn={gameState.currentTurn}
          myColor={myColor ?? null}
          selectedPiece={gameState.selectedPiece}
          legalMoves={isMyTurn && !sending ? gameState.legalMoves : []}
          onCellClick={handleCellClick}
          flipped={flipped}
          lastMove={lastMove}
        />
      </div>

      {/* My Player Card (bottom) */}
      <div className="px-4 py-2">
        <PlayerCard
          profile={myProfile}
          color={myColor ?? "white"}
          isActive={gameState.currentTurn === myColor}
        />
      </div>

      {/* Captured piece counts */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="flex justify-between gap-3">
          {(["black", "white"] as PlayerColor[]).map((color) => {
            const remaining = gameState.board.flat().filter((c) => c?.color === color).length;
            const captured = 12 - remaining;
            const isActive = gameState.currentTurn === color;
            const isMe = color === myColor;
            return (
              <div
                key={color}
                className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl"
                style={{
                  background: isActive ? "rgba(212,175,55,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isActive ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.05)"}`,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-full border"
                    style={{
                      background: color === "white"
                        ? "radial-gradient(circle at 35% 35%, #FFFFFF 0%, #D4B896 100%)"
                        : "radial-gradient(circle at 35% 35%, #555 0%, #000 100%)",
                      borderColor: "#D4AF37",
                    }}
                  />
                  <span className="text-xs" style={{ color: "rgba(212,175,55,0.55)", fontFamily: "Cinzel, serif" }}>
                    {isMe ? "Вы" : "Соперник"}
                  </span>
                </div>
                <span className="text-xs font-bold" style={{ color: captured > 0 ? "#FFD700" : "rgba(212,175,55,0.3)" }}>
                  Срублено: {captured}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resign confirm */}
      <AnimatePresence>
        {showResignConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          >
            <div
              className="mx-6 p-6 rounded-2xl"
              style={{
                background: "#1a0800",
                border: "1px solid rgba(212,175,55,0.25)",
                maxWidth: 300,
                width: "100%",
              }}
            >
              <h3
                className="text-lg font-bold text-center mb-2"
                style={{ fontFamily: "Cinzel, serif", color: "#FFD700" }}
              >
                Сдаться?
              </h3>
              <p className="text-sm text-center mb-4" style={{ color: "rgba(200,160,80,0.7)" }}>
                Соперник получит победу
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleResign}
                  className="py-2.5 cursor-pointer"
                  style={{
                    borderRadius: "12px",
                    background: "rgba(180,30,0,0.3)",
                    border: "1px solid rgba(200,50,30,0.4)",
                    color: "#ff6b6b",
                    fontFamily: "Cinzel, serif",
                  }}
                >
                  Сдаться
                </button>
                <button
                  onClick={() => setShowResignConfirm(false)}
                  className="py-2.5 cursor-pointer"
                  style={{ color: "rgba(212,175,55,0.6)" }}
                >
                  Продолжить игру
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Opponent left */}
      <AnimatePresence>
        {opponentLeft && !gameState.gameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
          >
            <div
              className="mx-6 p-6 rounded-2xl text-center"
              style={{
                background: "#1a0800",
                border: "1px solid rgba(212,175,55,0.25)",
                maxWidth: 300,
                width: "100%",
              }}
            >
              <WifiOff className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
              <h3
                className="text-lg font-bold mb-2"
                style={{ fontFamily: "Cinzel, serif", color: "#FFD700" }}
              >
                Соперник вышел
              </h3>
              <p className="text-sm mb-5" style={{ color: "rgba(200,160,80,0.7)" }}>
                Соперник не отвечает. Вы можете забрать победу.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleOpponentLeftWin}
                  className="py-2.5 cursor-pointer"
                  style={{
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #b8860b, #ffd700)",
                    color: "#1a0800",
                    fontFamily: "Cinzel, serif",
                  }}
                >
                  Забрать победу
                </button>
                <button
                  onClick={() => setOpponentLeft(false)}
                  className="py-2.5 cursor-pointer"
                  style={{ color: "rgba(212,175,55,0.6)" }}
                >
                  Ждать дальше
                </button>
                <button
                  onClick={() => { clearActiveGame(); navigate("/"); }}
                  className="py-2.5 cursor-pointer"
                  style={{ color: "rgba(212,175,55,0.4)" }}
                >
                  На главный экран
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game over */}
      {gameState.gameOver && !stakeResult && (
        <GameOverModal
          winner={gameState.winner}
          reason={gameState.winReason}
          myColor={myColor ?? null}
          onHome={() => { clearActiveGame(); navigate("/"); }}
          moveCount={gameState.moveNumber}
        />
      )}

      {/* Stake Result */}
      {stakeResult && (
        <GameResultModal
          result={stakeResult}
          onClose={() => { clearActiveGame(); navigate("/"); }}
          isLoading={isProcessingResult}
        />
      )}

      {/* Hidden debug panel */}
      <DebugPanel
        gameId={gameId ?? undefined}
        roomCode={roomCodeDisplay || undefined}
        myColor={myColor ?? undefined}
        moveNumber={gameState.moveNumber}
        currentTurn={gameState.currentTurn}
        realtimeConnected={realtimeConnected}
        lastUpdateTs={lastUpdateTs}
        pollingActive={!gameOverRef.current}
        onForceRefresh={async () => {
          if (!gameId) return;
          const game = await fetchGame(gameId);
          if (game) {
            appliedMoveNumberRef.current = game.move_number - 1;
            applyGameRow(game, false);
          }
        }}
      />
    </div>
  );
}
