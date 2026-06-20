import { supabase, setPlayerContext } from "../lib/supabase.ts";
import type { Board, Move, PlayerColor } from "../game/types.ts";

/**
 * Серверная reply от submit_move / submit_resign / claim_timeout_win.
 * Сервер — единственный авторитет: его board мы и применяем у себя локально.
 */
export type SecureMoveResult = {
  ok: boolean;
  duplicate?: boolean;
  board: Board;
  current_turn: PlayerColor;
  move_number: number;
  game_over: boolean;
  winner: PlayerColor | null;
  reason: string | null;
};

type ServerJump = {
  from_row: number;
  from_col: number;
  to_row: number;
  to_col: number;
  captured_row?: number;
  captured_col?: number;
};

/**
 * Преобразует клиентский Move (с локально посчитанными steps) в массив jumps
 * для отправки на сервер. Сервер сам валидирует каждый jump против правил.
 */
export function moveToJumps(move: Move): ServerJump[] {
  const jumps: ServerJump[] = [];
  let prevRow = move.fromRow;
  let prevCol = move.fromCol;
  for (const step of move.steps) {
    const jump: ServerJump = {
      from_row: prevRow,
      from_col: prevCol,
      to_row: step.toRow,
      to_col: step.toCol,
    };
    if (step.capturedRow >= 0 && step.capturedCol >= 0) {
      jump.captured_row = step.capturedRow;
      jump.captured_col = step.capturedCol;
    }
    jumps.push(jump);
    prevRow = step.toRow;
    prevCol = step.toCol;
  }
  return jumps;
}

/**
 * Atomic server-authoritative move submit. Сервер:
 *  • валидирует, что caller — участник и сейчас его ход;
 *  • валидирует каждый jump против правил русских шашек;
 *  • атомарно применяет ход к board_state в БД;
 *  • если игра закончилась — внутри той же транзакции выполняет settlement
 *    (process_game_result).
 *
 * Возвращает новое состояние или throws Error при rejection.
 */
export async function submitMove(
  gameId: string,
  playerId: string,
  expectedMoveNumber: number,
  move: Move,
): Promise<SecureMoveResult> {
  if (!supabase) throw new Error("OFFLINE");
  await setPlayerContext(playerId);
  const jumps = moveToJumps(move);
  const { data, error } = await supabase.rpc("submit_move", {
    p_game_id: gameId,
    p_player_id: playerId,
    p_expected_move_number: expectedMoveNumber,
    p_jumps: jumps,
  });
  if (error) throw new Error(error.message);
  return data as SecureMoveResult;
}

/** Сдаться. Атомарно: ставит status='finished' + settlement. */
export async function submitResign(
  gameId: string,
  playerId: string,
  reason = "Сдача",
): Promise<{ ok: boolean; winner: PlayerColor; reason: string }> {
  if (!supabase) throw new Error("OFFLINE");
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("submit_resign", {
    p_game_id: gameId,
    p_player_id: playerId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; winner: PlayerColor; reason: string };
}

/**
 * Засчитать тайм-аут соперника. Сервер проверяет, что
 * last_move_at < now() - p_timeout_s seconds. Иначе rejects.
 */
export async function claimTimeoutWin(
  gameId: string,
  playerId: string,
  timeoutSeconds = 90,
): Promise<{ ok: boolean; winner: PlayerColor; reason: string }> {
  if (!supabase) throw new Error("OFFLINE");
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("claim_timeout_win", {
    p_game_id: gameId,
    p_player_id: playerId,
    p_timeout_s: timeoutSeconds,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; winner: PlayerColor; reason: string };
}

/** Отменить свою waiting-комнату. */
export async function cancelWaitingRoom(
  gameId: string,
  playerId: string,
): Promise<void> {
  if (!supabase) return;
  await setPlayerContext(playerId);
  const { error } = await supabase.rpc("cancel_waiting_room", {
    p_game_id: gameId,
    p_player_id: playerId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Защищённый claim welcome bonus.
 *  • один раз на профиль (по wallet_transactions);
 *  • один раз на device fingerprint (≤1 welcome bonus с одного fp);
 *  • максимум 3 профиля с одного fp.
 */
export async function claimWelcomeBonus(
  playerId: string,
  deviceFpHash: string,
  amount = 100,
): Promise<{ ok: boolean; amount?: number; reason?: string }> {
  if (!supabase) return { ok: false, reason: "offline" };
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("claim_welcome_bonus", {
    p_player_id: playerId,
    p_device_fp_hash: deviceFpHash,
    p_bonus_amount: amount,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; amount?: number; reason?: string };
}

/**
 * Простой device fingerprint hash. Не криптоустойчивый, не для
 * AML — только для anti-farm welcome bonus.
 * Базируется на UA + screen + timezone + language + canvas hash.
 */
export async function computeDeviceFingerprint(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency ?? 0,
  ];
  // Canvas fingerprint
  try {
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 60;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 240, 60);
      ctx.fillStyle = "#069";
      ctx.fillText("shashki-royale-fp 🎲", 2, 12);
      parts.push(c.toDataURL());
    }
  } catch {
    /* canvas blocked */
  }
  const joined = parts.join("|");
  // SHA-256 via SubtleCrypto
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(joined));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
