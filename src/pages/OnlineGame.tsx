import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { ChevronLeft, AlertCircle, Flag, WifiOff, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import BoardView from "../components/Board.tsx";
import GameOverModal from "../components/GameOverModal.tsx";
import { GameResultModal, type GameResult } from "../components/GameResultModal.tsx";
import DebugPanel from "../components/DebugPanel.tsx";
import PlayerCard from "../components/PlayerCard.tsx";
import MatchmakingOverlay from "../components/MatchmakingOverlay.tsx";
import { supabase, supabaseConfigured, setPlayerContext } from "../lib/supabase.ts";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  fetchGame,
  updateGameState,
  insertMove,
  type GameRow,
} from "../services/gameRooms.ts";
import { submitMove, submitResign } from "../services/secureMoves.ts";
import { getOrCreateProfile, type Profile } from "../services/profiles.ts";
import { cancelStakeGame, getGameStake } from "../services/stakes.ts";
import { toast } from "sonner";
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
  stake?: number;
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
  const initialStake = typeof locationState.stake === "number" ? locationState.stake : null;

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
  // Matchmaking overlay state — only shown to game creator (white) while waiting
  const [gameStatus, setGameStatus] = useState<string>("waiting");
  const [stakeAmount, setStakeAmount] = useState<number | null>(initialStake);
  const [cancellingMatch, setCancellingMatch] = useState(false);
  const { handleFinishGame } = useGameResult();
  const opponentMovedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appliedMoveNumberRef = useRef(0);
  const lastOpponentActivityRef = useRef(Date.now());
  const gameOverRef = useRef(false);
  // Ensures processGameResult RPC is invoked at most once per match instance,
  // regardless of re-renders / fast taps / rapid realtime echoes. The RPC is
  // also idempotent server-side, but this avoids unnecessary network calls.
  const finishGameInFlightRef = useRef(false);
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

      // Track high-level status so the matchmaking overlay can hide as soon as
      // the game flips from 'waiting' to 'active'.
      setGameStatus(game.status);

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

      // If we don't have the stake amount yet (e.g. page reloaded mid-search),
      // fetch it once so the matchmaking overlay can display it.
      if (stakeAmount == null) {
        try {
          const s = await getGameStake(gameId);
          if (!cancelled.v && s) setStakeAmount(Number(s.entry_fee));
        } catch {
          /* non-fatal */
        }
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

          // Optimistic local apply for instant feedback. Server is authoritative;
          // we'll reconcile with server's board on response.
          const optimisticBoard = applyMove(board, matchingMove, currentTurn);
          const nextTurn: PlayerColor = currentTurn === "white" ? "black" : "white";
          const result = checkGameResult(optimisticBoard, nextTurn);
          const newMoveNumber = gameState.moveNumber + 1;

          appliedMoveNumberRef.current = newMoveNumber;
          lastSentMoveNumberRef.current = newMoveNumber;
          gameOverRef.current = result.over;

          setLastMove({
            fromRow: matchingMove.fromRow,
            fromCol: matchingMove.fromCol,
            toRow: matchingMove.finalRow,
            toCol: matchingMove.finalCol,
          });

          if (matchingMove.isCapture) play("capture");
          else play("move");
          if (matchingMove.promoted) setTimeout(() => play("promote"), 150);

          const nextLegal = result.over ? [] : generateLegalMoves(optimisticBoard, nextTurn);
          setGameState((prev) => ({
            ...prev,
            board: optimisticBoard,
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
            // SERVER-AUTHORITATIVE: единый RPC валидирует ход, применяет
            // его в БД, и (если конец) выполняет settlement в той же транзакции.
            // FALLBACK: если миграция v5 ещё не применена — используем legacy
            // путь (updateGameState + insertMove). Это обеспечивает zero-downtime
            // rollout: клиент v1.4.7+ начнёт использовать защищённый путь
            // автоматически как только пользователь зальёт SQL migration_v5.
            let serverResult: Awaited<ReturnType<typeof submitMove>> | null = null;
            try {
              serverResult = await submitMove(
                gameId,
                playerId,
                gameState.moveNumber,
                matchingMove,
              );
            } catch (rpcErr) {
              const msg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
              // Миграция ещё не применена → legacy path
              if (msg.includes("does not exist") || msg.includes("submit_move")) {
                console.warn("[OnlineGame] submit_move RPC unavailable, falling back to legacy path");
                serverResult = null;
              } else {
                throw rpcErr; // настоящий cheat-reject / NOT_YOUR_TURN / MUST_CAPTURE
              }
            }

            if (serverResult) {
              // Reconcile с сервером
              const serverBoard = serverResult.board;
              const serverTurn = serverResult.current_turn;
              const serverMoveNumber = serverResult.move_number;
              const serverGameOver = serverResult.game_over;
              const serverWinner = serverResult.winner;
              const serverReason = serverResult.reason;

              appliedMoveNumberRef.current = serverMoveNumber;
              lastSentMoveNumberRef.current = serverMoveNumber;
              gameOverRef.current = serverGameOver;

              if (serverGameOver) clearActiveGame();

              const reconciledLegal = serverGameOver
                ? []
                : generateLegalMoves(serverBoard, serverTurn);
              setGameState((prev) => ({
                ...prev,
                board: serverBoard,
                currentTurn: serverTurn,
                moveNumber: serverMoveNumber,
                gameOver: serverGameOver,
                winner: serverGameOver
                  ? serverWinner === "white" || serverWinner === "black"
                    ? serverWinner
                    : null
                  : null,
                winReason: serverGameOver ? serverReason : null,
                selectedPiece: null,
                legalMoves: reconciledLegal,
                captureChain: null,
              }));

              if (serverGameOver) {
                play(serverWinner === myColor ? "win" : "lose");
                if (!finishGameInFlightRef.current) {
                  finishGameInFlightRef.current = true;
                  try {
                    setIsProcessingResult(true);
                    const stakeResultData = await handleFinishGame(
                      gameId,
                      (serverWinner ?? "draw") as "white" | "black" | "draw",
                      serverReason ?? "",
                      playerId,
                    );
                    if (stakeResultData.result) setStakeResult(stakeResultData.result);
                  } catch (stakeErr) {
                    console.error("[OnlineGame] stake result fetch error:", stakeErr);
                  } finally {
                    setIsProcessingResult(false);
                  }
                }
              }
            } else {
              // LEGACY PATH (migration not yet applied)
              if (result.over) {
                clearActiveGame();
                await updateGameState(
                  gameId, optimisticBoard, nextTurn, newMoveNumber, myColor,
                  matchingMove.fromRow, matchingMove.fromCol,
                  matchingMove.finalRow, matchingMove.finalCol,
                );
                play(result.winner === myColor ? "win" : result.winner === "draw" ? "win" : "lose");
                if (!finishGameInFlightRef.current) {
                  finishGameInFlightRef.current = true;
                  try {
                    setIsProcessingResult(true);
                    const stakeResultData = await handleFinishGame(
                      gameId, result.winner as "white" | "black" | "draw",
                      result.reason, playerId,
                    );
                    if (stakeResultData.result) setStakeResult(stakeResultData.result);
                  } catch (stakeErr) {
                    console.error("[OnlineGame] processGameResult error:", stakeErr);
                  } finally {
                    setIsProcessingResult(false);
                  }
                }
              } else {
                await updateGameState(
                  gameId, optimisticBoard, nextTurn, newMoveNumber, myColor,
                  matchingMove.fromRow, matchingMove.fromCol,
                  matchingMove.finalRow, matchingMove.finalCol,
                );
              }
              insertMove(gameId, gameState.moveNumber, currentTurn, matchingMove, optimisticBoard, myColor).catch(() => null);
            }
          } catch (syncErr) {
            console.error("[OnlineGame] move rejected:", syncErr);
            setGameState(gameState);
            appliedMoveNumberRef.current = gameState.moveNumber;
            gameOverRef.current = false;
            const msg = syncErr instanceof Error ? syncErr.message : "Ошибка";
            setSyncError(
              msg.includes("STALE_MOVE_NUMBER")
                ? "Игра рассинхронизирована. Обновите страницу."
                : msg.includes("NOT_YOUR_TURN")
                ? "Сейчас ход соперника."
                : msg.includes("MUST_CAPTURE")
                ? "Доступно обязательное взятие."
                : `Ход отвергнут: ${msg}`,
            );
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
    if (finishGameInFlightRef.current) return;
    finishGameInFlightRef.current = true;
    try {
      try {
        await submitResign(gameId, playerId, reason);
      } catch (rpcErr) {
        const msg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
        if (!msg.includes("does not exist") && !msg.includes("submit_resign")) {
          throw rpcErr;
        }
        // Legacy fallback: миграция v5 не применена — старый путь сам сделает finish
      }
      const stakeResultData = await handleFinishGame(gameId, winner, reason, playerId);
      if (stakeResultData.result) setStakeResult(stakeResultData.result);
    } catch (err) {
      console.error("[OnlineGame] handleResign error:", err);
    }
  };

  /**
   * Cancel matchmaking (only valid while game.status === 'waiting' and we are
   * the creator). For stake games this calls cancel_stake_game RPC which
   * refunds the locked stake. For non-stake games it just navigates home.
   */
  const handleCancelMatchmaking = async () => {
    if (!gameId || cancellingMatch) return;
    setCancellingMatch(true);
    try {
      if (stakeAmount != null && stakeAmount > 0) {
        const res = await cancelStakeGame(playerId, gameId);
        if (res.error) {
          // If cancel failed because game already started, just stay in the game.
          if (res.error.includes("уже началась")) {
            toast.info("Игра уже началась — соперник присоединился");
            setCancellingMatch(false);
            return;
          }
          toast.error(res.error, {
            style: {
              background: "#2a0a00",
              border: "1px solid rgba(220,50,50,0.5)",
              color: "#ffd700",
              fontFamily: "Cinzel, serif",
            },
          });
        }
      }
      clearActiveGame();
      gameOverRef.current = true;
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось отменить";
      toast.error(msg);
    } finally {
      setCancellingMatch(false);
    }
  };

  const handleOpponentLeftWin = async () => {
    if (!gameId || !myColor) return;
    const reason = "Соперник вышел из игры";
    gameOverRef.current = true;
    clearActiveGame();
    setOpponentLeft(false);
    setGameState((prev) => ({ ...prev, gameOver: true, winner: myColor, winReason: reason }));
    play("win");
    if (finishGameInFlightRef.current) return;
    finishGameInFlightRef.current = true;
    try {
      const stakeResultData = await handleFinishGame(gameId, myColor, reason, playerId);
      if (stakeResultData.result) setStakeResult(stakeResultData.result);
    } catch (err) {
      console.error("[OnlineGame] handleOpponentLeftWin error:", err);
    }
  };

  // Capture hint is shown ONLY to the active player when they actually have
  // a mandatory capture available on the current board for their own colour.
  // Hard guards:
  //   • myColor known (we are a participant, not a spectator);
  //   • playerId known (anonymous bootstrap completed);
  //   • game is in 'playing' state (not waiting / not finished);
  //   • not loading / no sync error pending;
  //   • currentTurn matches our colour;
  //   • we got a non-stale state (move number advanced through applyGameRow);
  //   • the rule engine, evaluated against gameState.board + myColor (not the
  //     potentially-stale legalMoves array), confirms a capture exists.
  // This intentionally bypasses gameState.legalMoves because legalMoves may
  // contain the OPPONENT's moves between a local optimistic state update and
  // the next realtime echo (multi-capture / fast-update edge case).
  const isParticipant = Boolean(myColor && playerId);
  const isGamePlaying =
    gameStatus === "playing" &&
    !gameState.gameOver &&
    !loadError &&
    appliedMoveNumberRef.current >= gameState.moveNumber - 1;
  const hasMandatory =
    isParticipant &&
    isGamePlaying &&
    !sending &&
    myColor !== undefined &&
    gameState.currentTurn === myColor &&
    hasMandatoryCapture(gameState.board, myColor);
  const flipped = myColor === "black";

  if (loadError) {
    return (
      <div
        className="h-[100dvh] flex flex-col items-center justify-center px-6 gap-5"
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
        className="h-[100dvh] flex flex-col items-center justify-center px-6 gap-5"
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
      className="h-[100dvh] flex flex-col overflow-hidden"
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
            data-testid="turn-status"
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
          {hasMandatory && (
            <motion.div
              key="mandatory"
              data-testid="capture-hint"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 py-1 px-2.5 rounded-md"
              style={{
                background: "rgba(212,175,55,0.10)",
                border: "1px solid rgba(212,175,55,0.30)",
              }}
            >
              <AlertCircle
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: "#D4AF37" }}
              />
              <span
                className="text-[11px] leading-tight"
                style={{ color: "rgba(255,215,0,0.85)" }}
              >
                Доступно обязательное взятие
              </span>
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
      <div className="px-4 py-2 pb-4">
        <PlayerCard
          profile={myProfile}
          color={myColor ?? "white"}
          isActive={gameState.currentTurn === myColor}
        />
      </div>

      {/* Matchmaking overlay — shown to white (creator) while waiting for opponent */}
      <AnimatePresence>
        {myColor === "white" &&
          !opponentConnected &&
          gameStatus === "waiting" &&
          !gameState.gameOver && (
            <MatchmakingOverlay
              stake={stakeAmount}
              onCancel={handleCancelMatchmaking}
              cancelling={cancellingMatch}
            />
          )}
      </AnimatePresence>

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
