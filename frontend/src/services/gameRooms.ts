import { supabase, setPlayerContext } from "../lib/supabase.ts";
import type { Board, PlayerColor } from "../game/types.ts";
import { createInitialBoard } from "../game/initialBoard.ts";

export type GameRow = {
  id: string;
  room_code: string;
  status: "waiting" | "playing" | "finished";
  white_player_id: string;
  black_player_id: string | null;
  current_turn: PlayerColor;
  board_state: Board;
  move_number: number;
  winner: PlayerColor | null;
  resign_reason: string | null;
  last_from_row: number | null;
  last_from_col: number | null;
  last_to_row: number | null;
  last_to_col: number | null;
  created_at: string;
  updated_at: string;
};

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Принимает обычный код, ссылку вида /lobby?room=ABC123 или любой вставленный текст.
 * Это делает вход максимально простым: игрок может вставить код или всю ссылку.
 */
export function extractRoomCode(input: string): string {
  const raw = input.trim().toUpperCase();
  if (!raw) return "";

  try {
    const url = new URL(
      raw,
      typeof window !== "undefined" ? window.location.origin : "https://shashki.local",
    );
    const fromQuery = url.searchParams.get("room") ?? url.searchParams.get("code");
    if (fromQuery) return fromQuery.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  } catch {
    // Not a URL, continue with plain text normalization.
  }

  return raw.replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export async function createRoom(playerId: string): Promise<GameRow> {
  if (!supabase) throw new Error("Supabase не настроен");
  await setPlayerContext(playerId);

  const board = createInitialBoard();
  let lastError: string | null = null;

  // Код короткий и удобный, поэтому на редкий конфликт пробуем создать новый.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from("games")
      .insert({
        room_code: code,
        status: "waiting",
        white_player_id: playerId,
        black_player_id: null,
        current_turn: "white",
        board_state: board,
        move_number: 1,
        winner: null,
        resign_reason: null,
      })
      .select()
      .single();

    if (!error && data) return data as GameRow;

    lastError = error?.message ?? "Не удалось создать комнату";
    if (!lastError.toLowerCase().includes("duplicate") && !lastError.includes("23505")) {
      break;
    }
  }

  throw new Error(lastError ?? "Не удалось создать комнату");
}

export async function joinRoom(code: string, playerId: string): Promise<GameRow> {
  if (!supabase) throw new Error("Supabase не настроен");
  await setPlayerContext(playerId);
  const roomCode = extractRoomCode(code);
  const { data: game, error: fetchErr } = await supabase
    .from("games")
    .select("*")
    .eq("room_code", roomCode)
    .single();
  if (fetchErr || !game) throw new Error("Комната не найдена");
  if (game.status !== "waiting") throw new Error("Комната уже занята");
  if (game.white_player_id === playerId) throw new Error("Вы уже в этой комнате");
  const { data, error } = await supabase
    .from("games")
    .update({ black_player_id: playerId, status: "playing" })
    .eq("id", game.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as GameRow;
}

export async function fetchGame(gameId: string): Promise<GameRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();
  if (error) return null;
  return data as GameRow;
}

/**
 * Обновить состояние игры.
 * Теперь обязательно передаём playerId — RLS проверит что это участник.
 * Бросает ошибку при неудаче (для отката стейта в UI).
 */
export async function updateGameState(
  gameId: string,
  board: Board,
  currentTurn: PlayerColor,
  moveNumber: number,
  playerId: string,
  lastFromRow?: number,
  lastFromCol?: number,
  lastToRow?: number,
  lastToCol?: number,
): Promise<void> {
  if (!supabase) return;
  await setPlayerContext(playerId);
  const { error } = await supabase
    .from("games")
    .update({
      board_state: board,
      current_turn: currentTurn,
      move_number: moveNumber,
      ...(lastFromRow !== undefined
        ? { last_from_row: lastFromRow, last_from_col: lastFromCol, last_to_row: lastToRow, last_to_col: lastToCol }
        : {}),
    })
    .eq("id", gameId);
  if (error) throw new Error(`Ошибка обновления игры: ${error.message}`);
}

/**
 * Завершить игру.
 * Бросает ошибку при неудаче.
 */
export async function finishGame(
  gameId: string,
  board: Board,
  winner: PlayerColor | null,
  reason: string,
  moveNumber: number | undefined,
  playerId: string,
): Promise<void> {
  if (!supabase) return;
  await setPlayerContext(playerId);
  const { error } = await supabase
    .from("games")
    .update({
      board_state: board,
      status: "finished",
      winner,
      resign_reason: reason,
      ...(moveNumber !== undefined ? { move_number: moveNumber } : {}),
    })
    .eq("id", gameId);
  if (error) throw new Error(`Ошибка завершения игры: ${error.message}`);
}

export async function insertMove(
  gameId: string,
  moveNumber: number,
  playerColor: PlayerColor,
  moveData: unknown,
  board: Board,
  playerId: string,
): Promise<void> {
  if (!supabase) return;
  await setPlayerContext(playerId);
  await supabase.from("moves").insert({
    game_id: gameId,
    move_number: moveNumber,
    player_color: playerColor,
    move_data: moveData,
    board_state: board,
  });
}

/**
 * Очистить старые зависшие комнаты текущего игрока (состояние waiting более 5 минут).
 * Это предотвращает подключение в "мертвые" комнаты.
 */
export async function cleanupOldRooms(playerId: string): Promise<void> {
  if (!supabase) return;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  try {
    await supabase
      .from("games")
      .update({ status: "finished", resign_reason: "Комната закрыта" })
      .eq("status", "waiting")
      .lt("created_at", fiveMinutesAgo);
  } catch (e) {
    console.error("[cleanupOldRooms]", e);
  }
}

/**
 * Быстрая игра: ищет любую свободную комнату (status=waiting),
 * где создатель — не текущий игрок.
 * Если находит — присоединяется и возвращает GameRow.
 * Если не находит — возвращает null (значит нужно создать свою).
 */
export async function findAndJoinRandomRoom(playerId: string): Promise<GameRow | null> {
  if (!supabase) throw new Error("Supabase не настроен");
  await setPlayerContext(playerId);
  
  // Очистить старые комнаты текущего игрока
  await cleanupOldRooms(playerId);
  
  // Очистить старые комнаты других игроков (доп. чистка)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await supabase
    .from("games")
    .update({ status: "finished", resign_reason: "Комната закрыта" })
    .eq("status", "waiting")
    .lt("created_at", fiveMinutesAgo)
    ;

  // Ищем самую старую свежую свободную комнату (FIFO — справедливо)
  const { data: rooms, error: searchErr } = await supabase
    .from("games")
    .select("*")
    .eq("status", "waiting")
    .neq("white_player_id", playerId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (searchErr || !rooms || rooms.length === 0) {
    return null; // Нет свободных комнат
  }

  const room = rooms[0];

  // Пробуем присоединиться
  const { data, error } = await supabase
    .from("games")
    .update({ black_player_id: playerId, status: "playing" })
    .eq("id", room.id)
    .eq("status", "waiting") // Защита от гонки: если кто-то уже занял
    .select()
    .single();

  if (error || !data) {
    // Комнату уже заняли — пробуем ещё раз (рекурсия с лимитом)
    return null;
  }

  return data as GameRow;
}
